import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { InventoryItemType, Unit } from '../../generated/prisma/enums';
import { COST, formatDecimal, parseDecimal, QUANTITY } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import { convertQuantity } from '../../common/units/units';
import { RequestContextStore } from '../../context/request-context.store';
import { TENANT_DB, type TenantDb } from '../../prisma/tenant-prisma';
import type {
  ListStockQueryDto,
  RestockDto,
  RestockResultDto,
  StockItemDetailDto,
  StockItemDto,
} from './dto/stock.dto';
import {
  expandOrder,
  expectedStock,
  LedgerMathError,
  type ComponentLine,
  type RecipeLine,
  type StockItem,
} from './ledger-math';
import { LedgerService } from './ledger.service';
import { derivedStock, isServable, stockStatus, type StockStatus } from './stock-math';

type Decimal = Prisma.Decimal;

const LOW_RANK: Partial<Record<StockStatus, number>> = {
  negative: 0,
  'out-of-stock': 1,
  'low-stock': 2,
};

interface ItemRow {
  id: string;
  name: string;
  type: InventoryItemType;
  unit: Unit;
  standardUnitCost: Decimal | null;
}

interface View extends StockItemDto {
  lastCountQuantity: string | null;
  changeSinceLastCount: string | null;
}

const money4 = (v: Decimal | null): string | null => (v === null ? null : formatDecimal(v, COST));
const qty = (v: Decimal | null): string | null => (v === null ? null : formatDecimal(v, QUANTITY));

/**
 * B702 stock queries and restock (ADR 0021). Reads only: every stock change goes through
 * LedgerService (rule 3). All figures are for one branch: the caller's.
 */
@Injectable()
export class StockService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantDb,
    private readonly context: RequestContextStore,
    private readonly ledger: LedgerService,
  ) {}

  async listStock(query: ListStockQueryDto): Promise<StockItemDto[]> {
    const views = await this.views(this.requireBranch(), { type: query.type });
    return views
      .filter((v) => !query.status || v.status === query.status)
      .map((v) => this.summary(v));
  }

  /** Items that need attention: negative first, then out of stock, then low. */
  async listLowStock(): Promise<StockItemDto[]> {
    const views = await this.views(this.requireBranch(), {});
    return views
      .filter((v) => LOW_RANK[v.status] !== undefined)
      .sort((a, b) => LOW_RANK[a.status]! - LOW_RANK[b.status]! || a.name.localeCompare(b.name))
      .map((v) => this.summary(v));
  }

  async getStockItem(inventoryItemId: string): Promise<StockItemDetailDto> {
    const [view] = await this.views(this.requireBranch(), { ids: [inventoryItemId] });
    if (!view) {
      throw new AppException(404, 'INVENTORY_ITEM_NOT_FOUND', 'No such inventory item.', {
        inventoryItemId,
      });
    }
    return view;
  }

  async restock(inventoryItemId: string, dto: RestockDto): Promise<RestockResultDto> {
    const branchId = this.requireBranch();
    const { actor } = this.context.require();
    const result = await this.db.$transaction((tx) =>
      this.ledger.recordPurchase(tx, {
        branchId,
        inventoryItemId,
        quantity: dto.quantity,
        unit: dto.unit,
        unitCost: dto.unitCost,
        note: dto.note,
        actorId: actor!.id, // the route requires a staff role
      }),
    );
    return {
      transactionId: result.transactionId,
      inventoryItemId: result.inventoryItemId,
      quantityDelta: formatDecimal(result.quantityDelta, QUANTITY),
      unitCost: money4(result.unitCost),
      stockAfter: formatDecimal(result.stockAfter, QUANTITY),
      avgUnitCost: money4(result.avgUnitCost),
    };
  }

  /**
   * Customer menu availability (ADR 0021): a menu item is servable when every RAW/READY item one
   * serving needs (sauces expanded, ADR 0002) is in stock in the branch. Without a branch
   * (a multi-branch tenant's guest) availability is unknown, so everything shows as available.
   */
  async servableMenuItems(
    menuItemIds: string[],
    branchId: string | null,
  ): Promise<Map<string, boolean>> {
    const result = new Map(menuItemIds.map((id) => [id, true]));
    if (!branchId || menuItemIds.length === 0) return result;
    const recipeRows = await this.db.menuItemIngredient.findMany({
      where: { menuItemId: { in: menuItemIds } },
      select: { menuItemId: true, inventoryItemId: true, quantity: true, unit: true },
    });
    const ingredientIds = [...new Set(recipeRows.map((r) => r.inventoryItemId))];
    const components = await this.db.inventoryItemComponent.findMany({
      where: { mixedItemId: { in: ingredientIds } },
      select: { mixedItemId: true, componentItemId: true, quantity: true, unit: true },
    });
    const allIds = [...new Set([...ingredientIds, ...components.map((c) => c.componentItemId)])];
    const items = await this.db.inventoryItem.findMany({
      where: { id: { in: allIds } },
      select: { id: true, type: true, unit: true },
    });
    const stocks = await this.stockMap(branchId, allIds);

    const recipes = group(recipeRows, (r) => r.menuItemId) as Map<string, RecipeLine[]>;
    const byMixed = group(components, (c) => c.mixedItemId) as Map<string, ComponentLine[]>;
    const itemMap = new Map<string, StockItem>(items.map((i) => [i.id, i]));
    for (const menuItemId of menuItemIds) {
      try {
        const perServing = expandOrder([{ menuItemId, quantity: 1 }], recipes, itemMap, byMixed);
        result.set(menuItemId, isServable(perServing, stocks));
      } catch (error) {
        // A recipe the ledger could not deduct (bad data) cannot be served either. Anything else
        // is a bug and must surface, not quietly grey items out.
        if (!(error instanceof LedgerMathError)) throw error;
        result.set(menuItemId, false);
      }
    }
    return result;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────────────────
  private requireBranch(): string {
    const { branchId } = this.context.require();
    if (!branchId) {
      throw new AppException(
        400,
        'BRANCH_REQUIRED',
        'Choose a branch (x-dev-branch) to see or change its stock.',
      );
    }
    return branchId;
  }

  private summary(view: View): StockItemDto {
    const { lastCountQuantity: _c, changeSinceLastCount: _d, ...rest } = view;
    void _c;
    void _d;
    return rest;
  }

  private async stockMap(branchId: string, itemIds: string[]): Promise<Map<string, Decimal>> {
    const rows = await this.db.branchStock.findMany({
      where: { branchId, inventoryItemId: { in: itemIds } },
      select: { inventoryItemId: true, currentStock: true },
    });
    return new Map(rows.map((r) => [r.inventoryItemId, r.currentStock]));
  }

  /** Every active item (or the requested ones) with its stock figures for one branch. */
  private async views(
    branchId: string,
    filter: { type?: InventoryItemType; ids?: string[] },
  ): Promise<View[]> {
    const items: ItemRow[] = await this.db.inventoryItem.findMany({
      where: {
        isActive: true,
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.ids ? { id: { in: filter.ids } } : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, type: true, unit: true, standardUnitCost: true },
    });
    const mixedIds = items.filter((i) => i.type === 'MIXED').map((i) => i.id);
    const components = await this.db.inventoryItemComponent.findMany({
      where: { mixedItemId: { in: mixedIds } },
      // Components written together share created_at, so sort by name for a stable order.
      orderBy: [{ componentItem: { name: 'asc' } }, { id: 'asc' }],
      select: {
        mixedItemId: true,
        componentItemId: true,
        quantity: true,
        unit: true,
        componentItem: { select: { name: true, unit: true } },
      },
    });
    const stockIds = [
      ...new Set([...items.map((i) => i.id), ...components.map((c) => c.componentItemId)]),
    ];
    const stockRows = await this.db.branchStock.findMany({
      where: { branchId, inventoryItemId: { in: stockIds } },
      select: {
        inventoryItemId: true,
        currentStock: true,
        lowStockThreshold: true,
        avgUnitCost: true,
      },
    });
    const stock = new Map(stockRows.map((r) => [r.inventoryItemId, r]));
    const latestCount = await this.latestCounts(
      branchId,
      items.filter((i) => i.type !== 'MIXED').map((i) => i.id),
    );

    const views: View[] = [];
    for (const item of items) {
      const row = stock.get(item.id);
      const base = {
        inventoryItemId: item.id,
        name: item.name,
        type: item.type,
        unit: item.unit,
        lowStockThreshold: qty(row?.lowStockThreshold ?? null),
        avgUnitCost: money4(row?.avgUnitCost ?? null),
        standardUnitCost: money4(item.standardUnitCost),
      };
      if (item.type === 'MIXED') {
        const parts = components.filter((c) => c.mixedItemId === item.id);
        const derived = derivedStock(
          parts.map((c) => ({
            inventoryItemId: c.componentItemId,
            stock: stock.get(c.componentItemId)?.currentStock ?? parseDecimal('0'),
            perUnit: convertQuantity(c.quantity, c.unit, c.componentItem.unit),
          })),
        );
        views.push({
          ...base,
          status: 'derived',
          currentStock: null,
          expectedStock: null,
          lastCountedAt: null,
          derivedStock: formatDecimal(derived.quantity, QUANTITY),
          limitingItemId: derived.limitingItemId,
          components: parts.map((c) => ({
            inventoryItemId: c.componentItemId,
            name: c.componentItem.name,
            quantityPerUnit: formatDecimal(c.quantity, QUANTITY),
            unit: c.unit,
          })),
          lastCountQuantity: null,
          changeSinceLastCount: null,
        });
        continue;
      }
      const current = row?.currentStock ?? parseDecimal('0');
      const count = latestCount.get(item.id)!;
      const expected = expectedStock(count.quantity, [count.since]);
      views.push({
        ...base,
        status: stockStatus(current, row?.lowStockThreshold ?? null),
        currentStock: formatDecimal(current, QUANTITY),
        expectedStock: formatDecimal(expected, QUANTITY),
        lastCountedAt: count.takenAt?.toISOString() ?? null,
        derivedStock: null,
        limitingItemId: null,
        components: [],
        lastCountQuantity: qty(count.quantity),
        changeSinceLastCount: formatDecimal(count.since, QUANTITY),
      });
    }
    return views;
  }

  /**
   * Per item: the latest count (snapshot) and the sum of ledger rows written after it
   * (`seq > through_seq`, SCHEMA.md), or of every row when it was never counted.
   */
  private async latestCounts(
    branchId: string,
    itemIds: string[],
  ): Promise<Map<string, { quantity: Decimal | null; takenAt: Date | null; since: Decimal }>> {
    const snapshots = await this.db.inventorySnapshot.findMany({
      where: { branchId, inventoryItemId: { in: itemIds } },
      orderBy: [{ throughSeq: 'desc' }],
      select: { inventoryItemId: true, quantity: true, throughSeq: true, takenAt: true },
    });
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const s of snapshots) if (!latest.has(s.inventoryItemId)) latest.set(s.inventoryItemId, s);

    const neverCounted = itemIds.filter((id) => !latest.has(id));
    const allTime = await this.db.inventoryTransaction.groupBy({
      by: ['inventoryItemId'],
      where: { branchId, inventoryItemId: { in: neverCounted } },
      _sum: { quantityDelta: true },
    });
    const sums = new Map(allTime.map((g) => [g.inventoryItemId, g._sum.quantityDelta]));
    for (const s of latest.values()) {
      const since = await this.db.inventoryTransaction.aggregate({
        where: { branchId, inventoryItemId: s.inventoryItemId, seq: { gt: s.throughSeq } },
        _sum: { quantityDelta: true },
      });
      sums.set(s.inventoryItemId, since._sum.quantityDelta);
    }

    return new Map(
      itemIds.map((id) => {
        const s = latest.get(id);
        return [
          id,
          {
            quantity: s?.quantity ?? null,
            takenAt: s?.takenAt ?? null,
            since: sums.get(id) ?? parseDecimal('0'),
          },
        ];
      }),
    );
  }
}

function group<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}
