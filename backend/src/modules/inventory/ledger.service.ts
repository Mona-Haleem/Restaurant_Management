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
  expectedStock,
  LedgerMathError,
  nextAverageCost,
  type ComponentLine,
  type RecipeLine,
  type StockItem,
} from './ledger-math';
import { reconcileCount } from './reconciliation-math';
import { costPerStockUnit, StockMathError } from './stock-math';

type Decimal = Prisma.Decimal;
/** Smallest amount that no longer fits numeric(14,3) (11 digits before the point). */
const QUANTITY_LIMIT = parseDecimal(`1${'0'.repeat(QUANTITY.integerDigits)}`);
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

export interface PurchaseInput {
  branchId: string;
  inventoryItemId: string;
  /** As entered, positive (validated by the caller's DTO). */
  quantity: string;
  /** Defaults to the item's stock unit. */
  unit?: Unit;
  /** Per entered unit; optional (ADR 0021). Without it the average is unchanged. */
  unitCost?: string;
  actorId: string;
  note?: string;
}

export interface PurchaseRecorded extends StockMovement {
  transactionId: string;
  /** Cost stored on the PURCHASE row, per stock unit. */
  unitCost: Decimal | null;
  /** The branch's moving average after the purchase (ADR 0005). */
  avgUnitCost: Decimal | null;
}

export interface CountInput {
  inventoryItemId: string;
  /** The physical count as entered, zero or more (validated by the caller's DTO). */
  quantity: string;
  unit: Unit;
}

export interface ReconcileInput {
  branchId: string;
  actorId: string;
  /** Stored on each ADJUSTMENT row. */
  note?: string;
  counts: CountInput[];
}

export interface CountApplied {
  inventoryItemId: string;
  /** In the stock unit. */
  countedQuantity: Decimal;
  /** Latest snapshot + ledger rows since, read under the stock row lock. */
  expectedQuantity: Decimal;
  gap: Decimal;
  /** Null when the gap is zero. */
  adjustmentTransactionId: string | null;
  snapshotId: string;
  stockAfter: Decimal;
}

interface Movement {
  inventoryItemId: string;
  quantityDelta: Decimal;
  type: InventoryTransactionType;
  relatedOrderId?: string;
  note?: string;
  standardUnitCost: Decimal | null;
  /** PURCHASE only: cost per stock unit; updates the moving average. */
  purchaseCost?: Decimal | null;
}

interface Applied extends StockMovement {
  transactionId: string;
  unitCost: Decimal | null;
  avgUnitCost: Decimal | null;
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
    const item = await this.loadStockedItem(
      tx,
      input,
      'A MIXED item has no stock of its own: log the waste against its components (ADR 0002).',
    );
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
    return {
      transactionId: movement!.transactionId,
      inventoryItemId: movement!.inventoryItemId,
      quantityDelta: movement!.quantityDelta,
      stockAfter: movement!.stockAfter,
      negative: movement!.stockAfter.isNegative(),
    };
  }

  /**
   * One PURCHASE row for a restock (B702). With a cost, the moving average is re-weighted from
   * the stock before the purchase (ADR 0005); without one, the row carries the current average
   * (else the standard cost) and the average is unchanged (ADR 0021).
   */
  async recordPurchase(tx: LedgerTx, input: PurchaseInput): Promise<PurchaseRecorded> {
    const item = await this.loadStockedItem(
      tx,
      input,
      'A MIXED item has no stock of its own: restock its components (ADR 0002).',
    );
    const unit = input.unit ?? item.unit;
    const quantity = this.toStockQuantity(input.quantity, unit, item);
    let purchaseCost: Decimal | null = null;
    if (input.unitCost !== undefined) {
      try {
        purchaseCost = costPerStockUnit(parseDecimal(input.unitCost), unit, item.unit);
      } catch (error) {
        if (error instanceof StockMathError) {
          throw new AppException(400, error.code, error.message, { inventoryItemId: item.id });
        }
        throw error;
      }
    }
    const [movement] = await this.apply(tx, input.branchId, input.actorId, [
      {
        inventoryItemId: item.id,
        quantityDelta: quantity,
        type: 'PURCHASE',
        note: input.note,
        standardUnitCost: item.standardUnitCost,
        purchaseCost,
      },
    ]);
    return movement!;
  }

  /**
   * A physical count of one or more items (B902). Per item, in id order (the same lock order as
   * `apply`, so it never deadlocks with another writer): lock the stock row, then — holding the
   * lock, so no other writer's row can land in between — read expected stock (latest snapshot +
   * rows since), write an ADJUSTMENT row for a non-zero gap through `apply`, and snapshot the
   * count through the item's last ledger row (SCHEMA.md contract). Logged waste is already in
   * the ledger, so it is never part of the gap. Results come back in input order.
   */
  async reconcile(tx: LedgerTx, input: ReconcileInput): Promise<CountApplied[]> {
    // Keyed by the id as stored (lowercase), not as sent: a uuid in another case is the same item.
    const ids: string[] = [];
    const counted = new Map<string, { quantity: Decimal; standardUnitCost: Decimal | null }>();
    for (const c of input.counts) {
      const item = await this.loadStockedItem(
        tx,
        { inventoryItemId: c.inventoryItemId, branchId: input.branchId },
        'A MIXED item has no stock of its own: count its components (ADR 0002).',
      );
      if (counted.has(item.id)) {
        throw new AppException(400, 'DUPLICATE_COUNT', 'Count each item once per reconciliation.', {
          inventoryItemId: item.id,
        });
      }
      const quantity = this.toStockQuantity(c.quantity, c.unit, item, { allowZero: true });
      counted.set(item.id, { quantity, standardUnitCost: item.standardUnitCost });
      ids.push(item.id);
    }

    const tenantId = this.tenantId;
    const { branchId } = input;
    const sorted = [...counted.keys()].sort();
    await tx.branchStock.createMany({
      data: sorted.map((inventoryItemId) => ({ tenantId, branchId, inventoryItemId })),
      skipDuplicates: true,
    });

    const seen = new Map<string, { expected: Decimal; gap: Decimal; current: Decimal }>();
    for (const inventoryItemId of sorted) {
      // Lock the row first (the UPDATE holds it until commit); a concurrent writer now waits.
      const locked = await tx.branchStock.update({
        where: { tenantId_branchId_inventoryItemId: { tenantId, branchId, inventoryItemId } },
        data: { updatedAt: new Date() },
        select: { currentStock: true },
      });
      const snapshot = await tx.inventorySnapshot.findFirst({
        where: { branchId, inventoryItemId },
        orderBy: { throughSeq: 'desc' },
        select: { quantity: true, throughSeq: true },
      });
      const since = await tx.inventoryTransaction.aggregate({
        where: {
          branchId,
          inventoryItemId,
          ...(snapshot ? { seq: { gt: snapshot.throughSeq } } : {}),
        },
        _sum: { quantityDelta: true },
      });
      const expected = expectedStock(snapshot?.quantity ?? null, [
        since._sum.quantityDelta ?? parseDecimal('0'),
      ]);
      // A cache/ledger disagreement is a broken invariant: it surfaces as a logged 500.
      const { gap } = reconcileCount({
        counted: counted.get(inventoryItemId)!.quantity,
        expected,
        currentStock: locked.currentStock,
      });
      seen.set(inventoryItemId, { expected, gap, current: locked.currentStock });
    }

    const adjustments = await this.apply(
      tx,
      branchId,
      input.actorId,
      sorted
        .filter((id) => !seen.get(id)!.gap.isZero())
        .map((inventoryItemId) => ({
          inventoryItemId,
          quantityDelta: seen.get(inventoryItemId)!.gap,
          type: 'ADJUSTMENT' as const,
          note: input.note,
          standardUnitCost: counted.get(inventoryItemId)!.standardUnitCost,
        })),
    );
    const adjusted = new Map(adjustments.map((a) => [a.inventoryItemId, a]));

    const results = new Map<string, CountApplied>();
    for (const inventoryItemId of sorted) {
      // Still under the lock: the last row is this count's own ADJUSTMENT or an earlier one.
      const last = await tx.inventoryTransaction.aggregate({
        where: { branchId, inventoryItemId },
        _max: { seq: true },
      });
      const snapshotId = randomUUID();
      const quantity = counted.get(inventoryItemId)!.quantity;
      await tx.inventorySnapshot.create({
        data: {
          id: snapshotId,
          tenantId,
          branchId,
          inventoryItemId,
          quantity,
          throughSeq: last._max.seq ?? 0n,
        },
      });
      const { expected, gap, current } = seen.get(inventoryItemId)!;
      const adjustment = adjusted.get(inventoryItemId);
      results.set(inventoryItemId, {
        inventoryItemId,
        countedQuantity: quantity,
        expectedQuantity: expected,
        gap,
        adjustmentTransactionId: adjustment?.transactionId ?? null,
        snapshotId,
        stockAfter: adjustment?.stockAfter ?? current,
      });
    }
    return ids.map((id) => results.get(id)!);
  }

  // ── Internals ───────────────────────────────────────────────────────────────────────────
  private get tenantId(): string {
    return this.context.require().tenantId;
  }

  /**
   * An entered amount in the item's stock unit (ADR 0003). Refused, never rounded or clamped:
   * not positive (zero allowed only for a count), another dimension, more than 3 decimals, or
   * too large for numeric(14,3) after conversion (e.g. KG entered for a G item).
   */
  private toStockQuantity(
    entered: string,
    unit: Unit,
    item: { id: string; unit: Unit },
    options: { allowZero?: boolean } = {},
  ): Decimal {
    const quantity = parseDecimal(entered);
    if (quantity.isNegative() || (quantity.isZero() && !options.allowZero)) {
      throw new AppException(
        400,
        'QUANTITY_NOT_POSITIVE',
        options.allowZero ? 'A count cannot be below zero.' : 'The quantity must be above zero.',
        { inventoryItemId: item.id },
      );
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
    if (converted.greaterThanOrEqualTo(QUANTITY_LIMIT)) {
      throw new AppException(
        400,
        'QUANTITY_TOO_LARGE',
        `In ${item.unit} this needs more than ${QUANTITY.integerDigits} digits before the point.`,
        { inventoryItemId: item.id },
      );
    }
    return converted;
  }

  /** A RAW/READY item that can hold stock in an active branch of the tenant. */
  private async loadStockedItem(
    tx: LedgerTx,
    input: { inventoryItemId: string; branchId: string },
    mixedMessage: string,
  ): Promise<{ id: string; unit: Unit; standardUnitCost: Decimal | null }> {
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
      throw new AppException(400, 'MIXED_ITEM_NOT_STOCKED', mixedMessage, {
        inventoryItemId: item.id,
      });
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
    return item;
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
   * at write time: the branch's moving average, else the item's standard cost (ADR 0005). A
   * PURCHASE with a cost stores that cost and re-weights the average on the locked row.
   */
  private async apply(
    tx: LedgerTx,
    branchId: string,
    actorId: string,
    movements: Movement[],
  ): Promise<Applied[]> {
    if (movements.length === 0) return [];
    const tenantId = this.tenantId;
    const sorted = [...movements].sort((a, b) =>
      a.inventoryItemId < b.inventoryItemId ? -1 : a.inventoryItemId > b.inventoryItemId ? 1 : 0,
    );
    await tx.branchStock.createMany({
      data: sorted.map((m) => ({ tenantId, branchId, inventoryItemId: m.inventoryItemId })),
      skipDuplicates: true,
    });

    const applied: Applied[] = [];
    const rows: Prisma.InventoryTransactionCreateManyInput[] = [];
    for (const m of sorted) {
      const where = {
        tenantId_branchId_inventoryItemId: {
          tenantId,
          branchId,
          inventoryItemId: m.inventoryItemId,
        },
      };
      const stock = await tx.branchStock.update({
        where,
        data: { currentStock: { increment: m.quantityDelta } },
        select: { currentStock: true, avgUnitCost: true },
      });
      let unitCost = stock.avgUnitCost ?? m.standardUnitCost;
      let avgUnitCost = stock.avgUnitCost;
      if (m.type === 'PURCHASE' && m.purchaseCost) {
        // ADR 0005: re-weight from the stock before this purchase; the row is locked already.
        const stockBefore = stock.currentStock.minus(m.quantityDelta);
        avgUnitCost = nextAverageCost(
          stockBefore,
          stock.avgUnitCost,
          m.quantityDelta,
          m.purchaseCost,
        );
        await tx.branchStock.update({ where, data: { avgUnitCost } });
        unitCost = m.purchaseCost;
      }
      const transactionId = randomUUID();
      rows.push({
        id: transactionId,
        tenantId,
        branchId,
        inventoryItemId: m.inventoryItemId,
        type: m.type,
        quantityDelta: m.quantityDelta,
        unitCost,
        relatedOrderId: m.relatedOrderId ?? null,
        actorId,
        note: m.note ?? null,
      });
      applied.push({
        transactionId,
        inventoryItemId: m.inventoryItemId,
        quantityDelta: m.quantityDelta,
        stockAfter: stock.currentStock,
        unitCost,
        avgUnitCost,
      });
    }
    await tx.inventoryTransaction.createMany({ data: rows });
    return applied;
  }
}
