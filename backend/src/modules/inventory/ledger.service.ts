import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { InventoryTransactionType, Unit } from '../../generated/prisma/enums';
import { parseDecimal, QUANTITY } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import { convertQuantity, sameDimension } from '../../common/units/units';
import { RequestContextStore } from '../../context/request-context.store';
import type { TenantDb } from '../../prisma/tenant-prisma';
import {
  expandOrder,
  LedgerMathError,
  type ComponentLine,
  type RecipeLine,
  type StockItem,
} from './ledger-math';

type Decimal = Prisma.Decimal;
/** The caller's interactive transaction on the tenant-scoped client. */
export type LedgerTx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0];

export interface StockMovement {
  inventoryItemId: string;
  /** Signed, in the item's stock unit. */
  quantityDelta: Decimal;
  stockAfter: Decimal;
}

export interface OrderDeduction {
  /** True when the order had already been deducted: nothing was written (idempotent). */
  alreadyDeducted: boolean;
  movements: StockMovement[];
  /** Items that ended below zero (ADR 0006: allowed, flagged). */
  negativeItemIds: string[];
}

export interface WasteInput {
  branchId: string;
  inventoryItemId: string;
  /** As entered, positive, at most 3 decimals (validated by the caller's DTO). */
  quantity: string;
  unit: Unit;
  actorId: string;
  reason: string;
}

export interface WasteRecorded extends StockMovement {
  transactionId: string;
  negative: boolean;
}

interface Movement {
  inventoryItemId: string;
  quantityDelta: Decimal;
  type: InventoryTransactionType;
  relatedOrderId?: string;
  note?: string;
  standardUnitCost: Decimal | null;
}

function fromMathError(error: unknown): unknown {
  if (!(error instanceof LedgerMathError)) return error;
  const status = error.code === 'INVENTORY_ITEM_NOT_FOUND' ? 404 : 400;
  return new AppException(status, error.code, error.message, error.details);
}

/**
 * The single writer of `branch_stock.current_stock` (CLAUDE.md rule 3, ARCHITECTURE §5).
 * Every method runs inside the caller's transaction, so the stock change and its ledger rows
 * commit or roll back together with the caller's own writes (an order's stage change, a waste
 * entry). Order of writes per SCHEMA.md: lock/update the stock row first, then insert the rows.
 */
@Injectable()
export class LedgerService {
  // Every query runs on the caller's transaction (`tx`), so the service holds no client itself.
  constructor(private readonly context: RequestContextStore) {}

  /**
   * CONSUMPTION for an order that reached a `deducts_inventory` stage. Idempotent: the order row
   * is locked first, so a concurrent or repeated delivery waits, then finds the rows already
   * written and returns `alreadyDeducted` without writing anything. The unique key
   * (related_order_id, inventory_item_id, type) is the database backstop.
   */
  async deductOrder(
    tx: LedgerTx,
    input: { orderId: string; actorId: string },
  ): Promise<OrderDeduction> {
    // Lock the order row (UPDATE takes a row lock until commit). Callers change it anyway.
    const locked = await tx.order.updateMany({
      where: { id: input.orderId },
      data: { updatedAt: new Date() },
    });
    if (locked.count === 0) {
      throw new AppException(404, 'ORDER_NOT_FOUND', 'No such order.', { orderId: input.orderId });
    }
    const already = await tx.inventoryTransaction.count({
      where: { relatedOrderId: input.orderId, type: 'CONSUMPTION' },
    });
    if (already > 0) return { alreadyDeducted: true, movements: [], negativeItemIds: [] };

    const order = await tx.order.findUniqueOrThrow({
      where: { id: input.orderId },
      select: { branchId: true },
    });
    const lines = await tx.orderItem.findMany({
      where: { orderId: input.orderId },
      select: { menuItemId: true, quantity: true },
    });
    const recipeRows = await tx.menuItemIngredient.findMany({
      where: { menuItemId: { in: [...new Set(lines.map((l) => l.menuItemId))] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { menuItemId: true, inventoryItemId: true, quantity: true, unit: true },
    });
    const ingredientItems = await this.loadItems(
      tx,
      recipeRows.map((r) => r.inventoryItemId),
    );
    const mixedIds = [...ingredientItems.values()]
      .filter((i) => i.type === 'MIXED')
      .map((i) => i.id);
    const componentRows = await tx.inventoryItemComponent.findMany({
      where: { mixedItemId: { in: mixedIds } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { mixedItemId: true, componentItemId: true, quantity: true, unit: true },
    });
    const items = new Map([
      ...ingredientItems,
      ...(await this.loadItems(
        tx,
        componentRows.map((c) => c.componentItemId),
      )),
    ]);

    const recipes = new Map<string, RecipeLine[]>();
    for (const r of recipeRows) {
      recipes.set(r.menuItemId, [...(recipes.get(r.menuItemId) ?? []), r]);
    }
    const components = new Map<string, ComponentLine[]>();
    for (const c of componentRows) {
      components.set(c.mixedItemId, [...(components.get(c.mixedItemId) ?? []), c]);
    }

    let totals: Map<string, Decimal>;
    try {
      totals = expandOrder(lines, recipes, items, components);
    } catch (error) {
      throw fromMathError(error);
    }
    const movements = await this.apply(
      tx,
      order.branchId,
      input.actorId,
      [...totals].map(([inventoryItemId, amount]) => ({
        inventoryItemId,
        quantityDelta: amount.negated(),
        type: 'CONSUMPTION' as const,
        relatedOrderId: input.orderId,
        standardUnitCost: items.get(inventoryItemId)?.standardUnitCost ?? null,
      })),
    );
    return {
      alreadyDeducted: false,
      movements: movements.map((m) => ({
        inventoryItemId: m.inventoryItemId,
        quantityDelta: m.quantityDelta,
        stockAfter: m.stockAfter,
      })),
      negativeItemIds: movements
        .filter((m) => m.stockAfter.isNegative())
        .map((m) => m.inventoryItemId),
    };
  }

  /** One WASTE row for a logged waste quantity (B901 links its waste entry to the returned id). */
  async recordWaste(tx: LedgerTx, input: WasteInput): Promise<WasteRecorded> {
    const item = await tx.inventoryItem.findUnique({
      where: { id: input.inventoryItemId },
      select: { id: true, type: true, unit: true, isActive: true, standardUnitCost: true },
    });
    if (!item || !item.isActive) {
      throw new AppException(404, 'INVENTORY_ITEM_NOT_FOUND', 'No such inventory item.', {
        inventoryItemId: input.inventoryItemId,
      });
    }
    if (item.type === 'MIXED') {
      throw new AppException(
        400,
        'MIXED_ITEM_NOT_STOCKED',
        'A MIXED item has no stock of its own: log the waste against its components (ADR 0002).',
        { inventoryItemId: item.id },
      );
    }
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, isActive: true },
      select: { id: true },
    });
    if (!branch) {
      throw new AppException(400, 'BRANCH_NOT_FOUND', 'No active branch with that id.', {
        branchId: input.branchId,
      });
    }
    const quantity = this.toStockQuantity(input.quantity, input.unit, item);
    const [movement] = await this.apply(tx, input.branchId, input.actorId, [
      {
        inventoryItemId: item.id,
        quantityDelta: quantity.negated(),
        type: 'WASTE',
        note: input.reason,
        standardUnitCost: item.standardUnitCost,
      },
    ]);
    return { ...movement!, negative: movement!.stockAfter.isNegative() };
  }

  // ── Internals ───────────────────────────────────────────────────────────────────────────
  private get tenantId(): string {
    return this.context.require().tenantId;
  }

  private toStockQuantity(entered: string, unit: Unit, item: { id: string; unit: Unit }): Decimal {
    const quantity = parseDecimal(entered);
    if (!quantity.isPositive() || quantity.isZero()) {
      throw new AppException(400, 'QUANTITY_NOT_POSITIVE', 'The quantity must be above zero.', {
        inventoryItemId: item.id,
      });
    }
    if (!sameDimension(unit, item.unit)) {
      throw new AppException(
        400,
        'UNIT_DIMENSION_MISMATCH',
        `Cannot convert ${unit} to ${item.unit}.`,
        {
          inventoryItemId: item.id,
          unit,
          stockUnit: item.unit,
        },
      );
    }
    const converted = convertQuantity(quantity, unit, item.unit);
    if (converted.decimalPlaces() > QUANTITY.scale) {
      throw new AppException(
        400,
        'QUANTITY_TOO_PRECISE',
        `In ${item.unit} this needs more than ${QUANTITY.scale} decimals (ADR 0013).`,
        { inventoryItemId: item.id },
      );
    }
    return converted;
  }

  private async loadItems(
    tx: LedgerTx,
    ids: string[],
  ): Promise<Map<string, StockItem & { standardUnitCost: Decimal | null }>> {
    if (ids.length === 0) return new Map();
    const rows = await tx.inventoryItem.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, type: true, unit: true, standardUnitCost: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  /**
   * Applies movements for one branch: for each item, in id order (a fixed lock order, so two
   * transactions never deadlock), make sure the stock row exists, then add the delta atomically
   * (the UPDATE locks the row until commit). Only then insert the ledger rows, each with the cost
   * at write time: the branch's moving average, else the item's standard cost (ADR 0005).
   */
  private async apply(
    tx: LedgerTx,
    branchId: string,
    actorId: string,
    movements: Movement[],
  ): Promise<(StockMovement & { transactionId: string })[]> {
    if (movements.length === 0) return [];
    const tenantId = this.tenantId;
    const sorted = [...movements].sort((a, b) =>
      a.inventoryItemId < b.inventoryItemId ? -1 : a.inventoryItemId > b.inventoryItemId ? 1 : 0,
    );
    await tx.branchStock.createMany({
      data: sorted.map((m) => ({ tenantId, branchId, inventoryItemId: m.inventoryItemId })),
      skipDuplicates: true,
    });

    const applied: (StockMovement & { transactionId: string })[] = [];
    const rows: Prisma.InventoryTransactionCreateManyInput[] = [];
    for (const m of sorted) {
      const stock = await tx.branchStock.update({
        where: {
          tenantId_branchId_inventoryItemId: {
            tenantId,
            branchId,
            inventoryItemId: m.inventoryItemId,
          },
        },
        data: { currentStock: { increment: m.quantityDelta } },
        select: { currentStock: true, avgUnitCost: true },
      });
      const transactionId = randomUUID();
      rows.push({
        id: transactionId,
        tenantId,
        branchId,
        inventoryItemId: m.inventoryItemId,
        type: m.type,
        quantityDelta: m.quantityDelta,
        unitCost: stock.avgUnitCost ?? m.standardUnitCost,
        relatedOrderId: m.relatedOrderId ?? null,
        actorId,
        note: m.note ?? null,
      });
      applied.push({
        transactionId,
        inventoryItemId: m.inventoryItemId,
        quantityDelta: m.quantityDelta,
        stockAfter: stock.currentStock,
      });
    }
    await tx.inventoryTransaction.createMany({ data: rows });
    return applied;
  }
}
