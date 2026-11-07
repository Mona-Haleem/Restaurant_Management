import { parseDecimal } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../context/request-context';
import { RequestContextStore } from '../../context/request-context.store';
import type { TenantDb } from '../../prisma/tenant-prisma';
import type { StockService } from '../inventory/stock.service';
import { ReportsService } from './reports.service';

// Unit tests for the service's own decisions: branch scope (one branch, or every branch for an
// ADMIN with none chosen), the date-range rules and the waste-cost arithmetic. The real queries
// and day boundaries on Postgres: test/reports.e2e-spec.ts.

const CTX: RequestContext = {
  tenantId: 'tenant-a',
  tenantSlug: 'nile-bites',
  tenantName: 'Nile Bites',
  isDemoTenant: true,
  branchId: 'branch-1',
  actor: { id: 'manager-1', name: 'Salma', role: 'MANAGER' },
};

function setup() {
  const db = {
    tenant: { findFirstOrThrow: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
    orderWorkflowStage: { findMany: jest.fn().mockResolvedValue([{ key: 'served' }]) },
    order: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { total: parseDecimal('100.5') } }),
      count: jest.fn().mockResolvedValue(3),
    },
    inventoryTransaction: {
      groupBy: jest.fn().mockResolvedValue([
        {
          unitCost: parseDecimal('20'),
          _sum: { quantityDelta: parseDecimal('-0.255') },
          _count: { _all: 2 },
        },
        { unitCost: null, _sum: { quantityDelta: parseDecimal('-1') }, _count: { _all: 1 } },
      ]),
    },
    branch: { findMany: jest.fn().mockResolvedValue([{ id: 'branch-1' }, { id: 'branch-2' }]) },
  };
  const stock = {
    lowStockCount: jest.fn((branchId: string) => Promise.resolve(branchId === 'branch-1' ? 2 : 1)),
  };
  const store = new RequestContextStore();
  const service = new ReportsService(
    db as unknown as TenantDb,
    store,
    stock as unknown as StockService,
  );
  const run = <T>(fn: () => Promise<T>, ctx: RequestContext = CTX) => store.run(ctx, fn);
  return { db, stock, service, run };
}

describe('ReportsService', () => {
  it('reports one branch, with waste cost from the stored unit costs (rounded half-up)', async () => {
    const { db, stock, service, run } = setup();
    const kpis = await run(() => service.getKpis({ date: '2026-11-06' }));
    expect(kpis).toEqual({
      date: '2026-11-06',
      timezone: 'UTC',
      branchId: 'branch-1',
      revenue: '100.50',
      orderCount: 3,
      wasteCost: '5.10', // 0.255 × 20
      uncostedWasteRows: 1,
      lowStockCount: 2,
    });
    expect(db.order.count).toHaveBeenCalledWith({
      where: {
        branchId: 'branch-1',
        canceledAt: null,
        createdAt: {
          gte: new Date('2026-11-06T00:00:00Z'),
          lt: new Date('2026-11-07T00:00:00Z'),
        },
      },
    });
    expect(db.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          history: {
            some: expect.objectContaining({ toStageKey: { in: ['served'] } }) as unknown,
            // Counted once: not if it already reached a deducting stage on an earlier day.
            none: {
              toStageKey: { in: ['served'] },
              createdAt: { lt: new Date('2026-11-06T00:00:00Z') },
            },
          },
        }) as unknown,
      }),
    );
    expect(stock.lowStockCount).toHaveBeenCalledWith('branch-1');
  });

  it('reports every branch for an ADMIN with no branch chosen', async () => {
    const { db, stock, service, run } = setup();
    const admin = { ...CTX, branchId: null, actor: { id: 'a', name: 'K', role: 'ADMIN' as const } };
    const kpis = await run(() => service.getKpis({ date: '2026-11-06' }), admin);
    expect(kpis).toMatchObject({ branchId: null, lowStockCount: 3 });
    const where = (db.order.count.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;
    expect(where).not.toHaveProperty('branchId');
    expect(stock.lowStockCount).toHaveBeenCalledTimes(2);
  });

  it('sums a range day by day, with totals', async () => {
    const { service, run } = setup();
    const report = await run(() =>
      service.getDailyReport({ from: '2026-11-05', to: '2026-11-07' }),
    );
    expect(report.days.map((d) => d.date)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
    expect(report.totals).toEqual({
      date: '2026-11-05',
      revenue: '301.50',
      orderCount: 9,
      wasteCost: '15.30',
      uncostedWasteRows: 3,
    });
  });

  it.each([
    ['to before from', { from: '2026-11-07', to: '2026-11-06' }],
    ['more than 366 days', { from: '2025-01-01', to: '2026-01-02' }],
    ['a date that does not exist', { from: '2026-02-30', to: '2026-03-01' }],
  ])('refuses %s with INVALID_DATE_RANGE', async (_name, range) => {
    const { service, run } = setup();
    const error = await run(() => service.getDailyReport(range)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('INVALID_DATE_RANGE');
  });

  describe('getAnomalies', () => {
    const DELIVERED = new Date('2026-11-06T12:00:00Z');
    const BEFORE = new Date('2026-11-01T00:00:00Z');
    const AFTER = new Date('2026-11-06T13:00:00Z');
    const RANGE = { from: '2026-11-06', to: '2026-11-06' };

    function withOrders(overrides: {
      menuUpdatedAt?: Date;
      recipeCreatedAt?: Date;
      componentUpdatedAt?: Date;
      itemUpdatedAt?: Date;
      deducted?: string | null;
      recipeItem?: string;
      noRecipe?: boolean;
      laterDelivery?: Date;
    }) {
      const ctx = setup();
      const db = ctx.db as typeof ctx.db & Record<string, unknown>;
      Object.assign(db, {
        orderStageHistory: {
          findMany: jest.fn().mockResolvedValue([
            // Oldest first, as queried: a second deducting stage later (ADR 0022) is ignored.
            { orderId: 'order-1', createdAt: DELIVERED },
            { orderId: 'order-1', createdAt: overrides.laterDelivery ?? DELIVERED },
          ]),
        },
        orderItem: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ orderId: 'order-1', menuItemId: 'menu-1', quantity: 2 }]),
        },
        menuItem: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'menu-1', updatedAt: overrides.menuUpdatedAt ?? BEFORE }]),
        },
        menuItemIngredient: {
          findMany: jest.fn().mockResolvedValue(
            overrides.noRecipe
              ? []
              : [
                  {
                    menuItemId: 'menu-1',
                    inventoryItemId: overrides.recipeItem ?? 'sauce',
                    quantity: parseDecimal('100'),
                    unit: 'ML',
                    createdAt: overrides.recipeCreatedAt ?? BEFORE,
                  },
                ],
          ),
        },
        inventoryItemComponent: {
          findMany: jest.fn().mockResolvedValue([
            {
              mixedItemId: 'sauce',
              componentItemId: 'oil',
              quantity: parseDecimal('0.5'),
              unit: 'L',
              createdAt: BEFORE,
              updatedAt: overrides.componentUpdatedAt ?? BEFORE,
            },
          ]),
        },
        inventoryItem: {
          findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
            Promise.resolve(
              [
                { id: 'sauce', name: 'Garlic Sauce', type: 'MIXED', unit: 'L', updatedAt: BEFORE },
                {
                  id: 'oil',
                  name: 'Cooking Oil',
                  type: 'RAW',
                  unit: 'L',
                  updatedAt: overrides.itemUpdatedAt ?? BEFORE,
                },
              ].filter((i) => where.id.in.includes(i.id)),
            ),
          ),
        },
      });
      // 2 × 100 ML sauce = 0.2 L sauce = 0.1 L oil.
      ctx.db.inventoryTransaction.groupBy = jest.fn().mockResolvedValue(
        overrides.deducted === null
          ? []
          : [
              {
                relatedOrderId: 'order-1',
                inventoryItemId: 'oil',
                _sum: { quantityDelta: parseDecimal(overrides.deducted ?? '-0.1') },
              },
            ],
      );
      return ctx;
    }

    it('judges an order at its first deducting move, not a later deducting stage', async () => {
      // The recipe line was replaced between the two moves: the deduction used the old recipe.
      const { service, run } = withOrders({
        laterDelivery: new Date('2026-11-06T20:00:00Z'),
        recipeCreatedAt: AFTER,
      });
      const result = await run(() => service.getAnomalies(RANGE));
      expect(result.unchecked).toEqual([
        expect.objectContaining({ deliveredAt: DELIVERED.toISOString() }),
      ]);
    });

    it('ignores an edit to the menu item itself (price, name) while it keeps its recipe', async () => {
      const { service, run } = withOrders({ menuUpdatedAt: AFTER });
      const result = await run(() => service.getAnomalies(RANGE));
      expect(result).toMatchObject({ checkedOrders: 1, anomalies: [], unchecked: [] });
    });

    it('checks a normal delivery and flags nothing', async () => {
      const { service, run } = withOrders({});
      const result = await run(() => service.getAnomalies(RANGE));
      expect(result).toMatchObject({ checkedOrders: 1, anomalies: [], unchecked: [] });
    });

    it('flags a bad deduction through a MIXED component', async () => {
      const { service, run } = withOrders({ deducted: '-0.3' });
      const result = await run(() => service.getAnomalies(RANGE));
      expect(result.anomalies).toEqual([
        expect.objectContaining({
          orderId: 'order-1',
          inventoryItemId: 'oil',
          itemName: 'Cooking Oil',
          kind: 'OVER_DEDUCTED',
          expectedQuantity: '0.100',
          actualQuantity: '0.300',
          unit: 'L',
        }),
      ]);
    });

    it('flags a delivery with no deduction rows', async () => {
      const { service, run } = withOrders({ deducted: null });
      const result = await run(() => service.getAnomalies(RANGE));
      expect(result.anomalies.map((a) => a.kind)).toEqual(['NOT_DEDUCTED']);
    });

    it.each([
      ['the menu item, now with an empty recipe', { menuUpdatedAt: AFTER, noRecipe: true }],
      ['a recipe line', { recipeCreatedAt: AFTER }],
      ['a MIXED component', { componentUpdatedAt: AFTER }],
      ['an inventory item', { itemUpdatedAt: AFTER }],
    ])('does not judge an order when %s changed after delivery', async (_name, overrides) => {
      const { service, run } = withOrders(overrides);
      const result = await run(() => service.getAnomalies(RANGE));
      expect(result).toMatchObject({ checkedOrders: 0, anomalies: [] });
      expect(result.unchecked).toEqual([
        expect.objectContaining({ orderId: 'order-1', deliveredAt: DELIVERED.toISOString() }),
      ]);
    });

    it('lists an order whose recipe can no longer be expanded as unchecked', async () => {
      const { service, run } = withOrders({ recipeItem: 'archived-item' });
      const result = await run(() => service.getAnomalies(RANGE));
      expect(result.checkedOrders).toBe(0);
      expect(result.unchecked[0]!.reason).toContain('cannot be expanded');
    });

    it('returns an empty report when nothing was delivered', async () => {
      const ctx = setup();
      Object.assign(ctx.db, {
        orderStageHistory: { findMany: jest.fn().mockResolvedValue([]) },
      });
      const result = await ctx.run(() => ctx.service.getAnomalies(RANGE));
      expect(result).toEqual({
        from: RANGE.from,
        to: RANGE.to,
        branchId: 'branch-1',
        checkedOrders: 0,
        anomalies: [],
        unchecked: [],
      });
    });
  });

  it('accepts exactly 366 days', async () => {
    const { service, run } = setup();
    const report = await run(() =>
      service.getDailyReport({ from: '2024-01-01', to: '2024-12-31' }),
    );
    expect(report.days).toHaveLength(366);
  });
});
