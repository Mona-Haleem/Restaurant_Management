import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import {
  formatDecimal,
  MONEY,
  parseDecimal,
  QUANTITY,
  roundHalfUp,
} from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import { RequestContextStore } from '../../context/request-context.store';
import { TENANT_DB, type TenantDb } from '../../prisma/tenant-prisma';
import { expandOrder, LedgerMathError, type StockItem } from '../inventory/ledger-math';
import { StockService } from '../inventory/stock.service';
import { checkDeduction } from './anomalies';
import type {
  AnomaliesDto,
  DailyReportDto,
  DateRangeQueryDto,
  DayFiguresDto,
  DeductionAnomalyDto,
  KpisDto,
  KpisQueryDto,
  UncheckedOrderDto,
} from './dto/reports.dto';
import { daysInRange, isRealDate, localDate, localDayRanges, type LocalDay } from './local-day';

type Decimal = Prisma.Decimal;

/** Longest date range a report accepts (a leap year). */
const MAX_DAYS = 366;
const CHANGED_AFTER_DELIVERY =
  'A menu item, recipe or inventory item changed after delivery, so it was not checked ' +
  '(there is no recipe history yet).';

interface Scope {
  timezone: string;
  /** Null = every branch (an ADMIN with no branch chosen). */
  branchId: string | null;
  /** Keys of the stages flagged `deductsInventory` (rule 2: flags, never names). */
  deductKeys: string[];
}

/**
 * Reports (B1101). Sums and counts run in Postgres through the tenant-scoped client, one
 * aggregate per local day ([start, end) instants from the tenant's timezone, ADR 0026). Raw SQL
 * would skip the tenant scope (ADR 0015), so there is none.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantDb,
    private readonly context: RequestContextStore,
    private readonly stock: StockService,
  ) {}

  async getKpis(query: KpisQueryDto): Promise<KpisDto> {
    const scope = await this.scope();
    const date = query.date ?? localDate(new Date(), scope.timezone);
    this.checkRange(date, date);
    const [day] = localDayRanges(date, date, scope.timezone);
    const figures = await this.dayFigures(scope, day!);
    return {
      ...figures,
      timezone: scope.timezone,
      branchId: scope.branchId,
      lowStockCount: await this.lowStockCount(scope),
    };
  }

  async getDailyReport(query: DateRangeQueryDto): Promise<DailyReportDto> {
    const scope = await this.scope();
    this.checkRange(query.from, query.to);
    const days: DayFiguresDto[] = [];
    for (const day of localDayRanges(query.from, query.to, scope.timezone)) {
      days.push(await this.dayFigures(scope, day));
    }
    const sum = (pick: (d: DayFiguresDto) => string): string =>
      formatDecimal(
        days.reduce((total, d) => total.plus(parseDecimal(pick(d))), parseDecimal('0')),
        MONEY,
      );
    return {
      from: query.from,
      to: query.to,
      timezone: scope.timezone,
      branchId: scope.branchId,
      days,
      totals: {
        date: query.from,
        revenue: sum((d) => d.revenue),
        orderCount: days.reduce((n, d) => n + d.orderCount, 0),
        wasteCost: sum((d) => d.wasteCost),
        uncostedWasteRows: days.reduce((n, d) => n + d.uncostedWasteRows, 0),
      },
    };
  }

  /**
   * Every order that reached a `deductsInventory` stage in the range, compared with what its
   * recipe expects now (`expandOrder`, the B701 rules). An order whose menu item, recipe lines or
   * inventory items changed after delivery is listed as unchecked instead of being judged
   * against a recipe it was not deducted with.
   */
  async getAnomalies(query: DateRangeQueryDto): Promise<AnomaliesDto> {
    const scope = await this.scope();
    this.checkRange(query.from, query.to);
    const days = localDayRanges(query.from, query.to, scope.timezone);
    const start = days[0]!.start;
    const end = days.at(-1)!.end;

    const deliveries = await this.db.orderStageHistory.findMany({
      where: {
        toStageKey: { in: scope.deductKeys },
        createdAt: { gte: start, lt: end },
        // An order counts once, at its first deducting move (ADR 0022 allows a later deducting
        // stage): skip orders that already reached one before the range.
        order: {
          canceledAt: null,
          ...this.branchWhere(scope),
          history: { none: { toStageKey: { in: scope.deductKeys }, createdAt: { lt: start } } },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { orderId: 'asc' }],
      select: { orderId: true, createdAt: true },
    });
    const deliveredAt = new Map<string, Date>();
    for (const d of deliveries)
      if (!deliveredAt.has(d.orderId)) deliveredAt.set(d.orderId, d.createdAt);
    // Newest delivery first in the report.
    const orderIds = [...deliveredAt.keys()].sort(
      (a, b) => deliveredAt.get(b)!.getTime() - deliveredAt.get(a)!.getTime() || (a < b ? -1 : 1),
    );
    const base = { from: query.from, to: query.to, branchId: scope.branchId };
    if (orderIds.length === 0) return { ...base, checkedOrders: 0, anomalies: [], unchecked: [] };

    const lines = await this.db.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, menuItemId: true, quantity: true },
    });
    const menuIds = [...new Set(lines.map((l) => l.menuItemId))];
    const menuItems = await this.db.menuItem.findMany({
      where: { id: { in: menuIds } },
      select: { id: true, updatedAt: true },
    });
    const recipeRows = await this.db.menuItemIngredient.findMany({
      where: { menuItemId: { in: menuIds } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        menuItemId: true,
        inventoryItemId: true,
        quantity: true,
        unit: true,
        createdAt: true,
      },
    });
    const deducted = await this.db.inventoryTransaction.groupBy({
      by: ['relatedOrderId', 'inventoryItemId'],
      where: { type: 'CONSUMPTION', relatedOrderId: { in: orderIds } },
      _sum: { quantityDelta: true },
    });
    const items = await this.loadItems([
      ...recipeRows.map((r) => r.inventoryItemId),
      ...deducted.map((d) => d.inventoryItemId),
    ]);
    const mixedIds = [...items.values()].filter((i) => i.type === 'MIXED').map((i) => i.id);
    const componentRows = await this.db.inventoryItemComponent.findMany({
      where: { mixedItemId: { in: mixedIds } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        mixedItemId: true,
        componentItemId: true,
        quantity: true,
        unit: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    for (const [id, item] of await this.loadItems(componentRows.map((c) => c.componentItemId))) {
      items.set(id, item);
    }

    const menuUpdated = new Map(menuItems.map((m) => [m.id, m.updatedAt]));
    const recipes = group(recipeRows, (r) => r.menuItemId);
    const components = group(componentRows, (c) => c.mixedItemId);
    const linesByOrder = group(lines, (l) => l.orderId);
    const deductedByOrder = group(deducted, (d) => d.relatedOrderId!);

    const anomalies: DeductionAnomalyDto[] = [];
    const unchecked: UncheckedOrderDto[] = [];
    let checkedOrders = 0;
    for (const orderId of orderIds) {
      const at = deliveredAt.get(orderId)!;
      const orderLines = linesByOrder.get(orderId) ?? [];
      const orderMenu = [...new Set(orderLines.map((l) => l.menuItemId))];
      const orderRecipe = orderMenu.flatMap((m) => recipes.get(m) ?? []);
      const usedItems = new Set(orderRecipe.map((r) => r.inventoryItemId));
      const orderComponents = [...usedItems].flatMap((id) => components.get(id) ?? []);
      for (const c of orderComponents) usedItems.add(c.componentItemId);
      const changed =
        // A recipe edit replaces its lines (ADR 0019), so new line times mark it; the menu item's
        // own time only matters when its recipe is now empty (cleared after delivery).
        orderMenu.some((m) => !recipes.has(m) && (menuUpdated.get(m) ?? at) > at) ||
        orderRecipe.some((r) => r.createdAt > at) ||
        orderComponents.some((c) => c.createdAt > at || c.updatedAt > at) ||
        [...usedItems].some((id) => (items.get(id)?.updatedAt ?? at) > at);
      if (changed) {
        unchecked.push({ orderId, deliveredAt: at.toISOString(), reason: CHANGED_AFTER_DELIVERY });
        continue;
      }
      let expected: Map<string, Decimal>;
      try {
        expected = expandOrder(orderLines, recipes, items, components);
      } catch (error) {
        if (!(error instanceof LedgerMathError)) throw error;
        unchecked.push({
          orderId,
          deliveredAt: at.toISOString(),
          reason: `Its recipe cannot be expanded: ${error.message}.`,
        });
        continue;
      }
      checkedOrders += 1;
      const actual = new Map(
        (deductedByOrder.get(orderId) ?? []).map((d) => [
          d.inventoryItemId,
          (d._sum.quantityDelta ?? parseDecimal('0')).negated(),
        ]),
      );
      for (const flag of checkDeduction({ expected, actual }, (id) => items.get(id)!)) {
        const item = items.get(flag.inventoryItemId)!;
        anomalies.push({
          orderId,
          deliveredAt: at.toISOString(),
          inventoryItemId: flag.inventoryItemId,
          itemName: item.name,
          kind: flag.kind,
          expectedQuantity: formatDecimal(flag.expected, QUANTITY),
          actualQuantity: formatDecimal(flag.actual, QUANTITY),
          unit: item.unit,
          reason: flag.reason,
        });
      }
    }
    return { ...base, checkedOrders, anomalies, unchecked };
  }

  // ── Internals ───────────────────────────────────────────────────────────────────────────
  private async scope(): Promise<Scope> {
    const { branchId } = this.context.require();
    const tenant = await this.db.tenant.findFirstOrThrow({ select: { timezone: true } });
    const stages = await this.db.orderWorkflowStage.findMany({
      where: { deductsInventory: true },
      select: { key: true },
    });
    return { timezone: tenant.timezone, branchId, deductKeys: stages.map((s) => s.key) };
  }

  private branchWhere(scope: Scope): { branchId?: string } {
    return scope.branchId ? { branchId: scope.branchId } : {};
  }

  private checkRange(from: string, to: string): void {
    if (!isRealDate(from) || !isRealDate(to)) {
      throw new AppException(400, 'INVALID_DATE_RANGE', 'That date does not exist.', { from, to });
    }
    const days = daysInRange(from, to);
    if (days < 1 || days > MAX_DAYS) {
      throw new AppException(
        400,
        'INVALID_DATE_RANGE',
        `A report covers 1 to ${MAX_DAYS} days, with \`to\` on or after \`from\`.`,
        { from, to, maxDays: MAX_DAYS },
      );
    }
  }

  /** One local day's revenue, order count and waste cost, aggregated in the database. */
  private async dayFigures(scope: Scope, day: LocalDay): Promise<DayFiguresDto> {
    const range = { gte: day.start, lt: day.end };
    const branch = this.branchWhere(scope);
    const [revenue, orderCount, waste] = await Promise.all([
      // Revenue is earned when the order reaches its deducting stage (served), not when placed.
      this.db.order.aggregate({
        where: {
          ...branch,
          canceledAt: null,
          // Earned once, on the day of the first deducting move (a later deducting stage, ADR
          // 0022, must not count it again).
          history: {
            some: { toStageKey: { in: scope.deductKeys }, createdAt: range },
            none: { toStageKey: { in: scope.deductKeys }, createdAt: { lt: day.start } },
          },
        },
        _sum: { total: true },
      }),
      this.db.order.count({ where: { ...branch, canceledAt: null, createdAt: range } }),
      // Σ quantity per stored unit cost; only the few distinct costs are multiplied here.
      this.db.inventoryTransaction.groupBy({
        by: ['unitCost'],
        where: { ...branch, type: 'WASTE', createdAt: range },
        _sum: { quantityDelta: true },
        _count: { _all: true },
      }),
    ]);
    let wasteCost = parseDecimal('0');
    let uncostedWasteRows = 0;
    for (const g of waste) {
      if (g.unitCost === null) {
        uncostedWasteRows += g._count._all;
        continue;
      }
      wasteCost = wasteCost.plus(
        (g._sum.quantityDelta ?? parseDecimal('0')).negated().times(g.unitCost),
      );
    }
    return {
      date: day.date,
      revenue: formatDecimal(revenue._sum.total ?? parseDecimal('0'), MONEY),
      orderCount,
      wasteCost: formatDecimal(roundHalfUp(wasteCost, MONEY), MONEY),
      uncostedWasteRows,
    };
  }

  private async lowStockCount(scope: Scope): Promise<number> {
    if (scope.branchId) return this.stock.lowStockCount(scope.branchId);
    const branches = await this.db.branch.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    let total = 0;
    for (const b of branches) total += await this.stock.lowStockCount(b.id);
    return total;
  }

  private async loadItems(
    ids: string[],
  ): Promise<Map<string, StockItem & { name: string; updatedAt: Date }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.inventoryItem.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, type: true, unit: true, updatedAt: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }
}

function group<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}
