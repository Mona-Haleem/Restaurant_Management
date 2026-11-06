import type { Prisma } from '../../generated/prisma/client';
import { parseDecimal } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../context/request-context';
import { RequestContextStore } from '../../context/request-context.store';
import type { TenantDb } from '../../prisma/tenant-prisma';
import type { LedgerService } from './ledger.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

// The service's own decisions: branch requirement, statuses, expected and derived figures, the
// low-stock order, restock hand-off and the availability shortcuts. Real queries, tenant scoping
// and the ledger are proven against Postgres in test/stock.e2e-spec.ts; this fake only answers.

type Decimal = Prisma.Decimal;
const D = (v: string): Decimal => parseDecimal(v);

const CTX: RequestContext = {
  tenantId: 't',
  tenantSlug: 'nile-bites',
  tenantName: 'Nile Bites',
  isDemoTenant: true,
  branchId: 'branch-1',
  actor: { id: 'manager-1', name: 'Salma', role: 'MANAGER' },
};

const ITEMS = [
  { id: 'beef', name: 'Beef', type: 'RAW', unit: 'KG', standardUnitCost: D('420') },
  { id: 'buns', name: 'Buns', type: 'READY', unit: 'PCS', standardUnitCost: null },
  { id: 'cheese', name: 'Cheese', type: 'RAW', unit: 'KG', standardUnitCost: null },
  { id: 'gone', name: 'Gone', type: 'RAW', unit: 'KG', standardUnitCost: null },
  { id: 'sauce', name: 'Sauce', type: 'MIXED', unit: 'L', standardUnitCost: null },
];
const STOCK = [
  {
    inventoryItemId: 'beef',
    currentStock: D('7.5'),
    lowStockThreshold: D('5'),
    avgUnitCost: D('400'),
  },
  { inventoryItemId: 'buns', currentStock: D('-2'), lowStockThreshold: null, avgUnitCost: null },
  { inventoryItemId: 'cheese', currentStock: D('1'), lowStockThreshold: D('2'), avgUnitCost: null },
  { inventoryItemId: 'gone', currentStock: D('0'), lowStockThreshold: null, avgUnitCost: null },
];

function fakeDb() {
  const ids = (where: { id?: { in: string[] }; type?: string } = {}) =>
    ITEMS.filter(
      (i) => (!where.id || where.id.in.includes(i.id)) && (!where.type || i.type === where.type),
    );
  const db = {
    inventoryItem: {
      findMany: jest.fn((args: { where?: { id?: { in: string[] }; type?: string } }) =>
        Promise.resolve(ids(args.where)),
      ),
    },
    inventoryItemComponent: {
      findMany: jest.fn(() =>
        Promise.resolve([
          // per 1 L of sauce: 0.5 KG beef, 250 G cheese → min(7.5/0.5, 1/0.25) = 4 L, limited by cheese
          {
            mixedItemId: 'sauce',
            componentItemId: 'beef',
            quantity: D('0.5'),
            unit: 'KG',
            componentItem: { name: 'Beef', unit: 'KG' },
          },
          {
            mixedItemId: 'sauce',
            componentItemId: 'cheese',
            quantity: D('250'),
            unit: 'G',
            componentItem: { name: 'Cheese', unit: 'KG' },
          },
        ]),
      ),
    },
    branchStock: {
      findMany: jest.fn((args: { where: { inventoryItemId: { in: string[] } } }) =>
        Promise.resolve(
          STOCK.filter((s) => args.where.inventoryItemId.in.includes(s.inventoryItemId)),
        ),
      ),
    },
    inventorySnapshot: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            inventoryItemId: 'beef',
            quantity: D('7'),
            throughSeq: 10n,
            takenAt: new Date('2026-11-05T20:00:00Z'),
          },
        ]),
      ),
    },
    inventoryTransaction: {
      groupBy: jest.fn(() =>
        Promise.resolve([
          { inventoryItemId: 'buns', _sum: { quantityDelta: D('-2') } },
          { inventoryItemId: 'cheese', _sum: { quantityDelta: D('1') } },
        ]),
      ),
      aggregate: jest.fn(() => Promise.resolve({ _sum: { quantityDelta: D('0.5') } })),
    },
    menuItemIngredient: { findMany: jest.fn(() => Promise.resolve([] as unknown[])) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return db;
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof AppException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
}

describe('StockService', () => {
  const store = new RequestContextStore();
  let db: ReturnType<typeof fakeDb>;
  let ledger: { recordPurchase: jest.Mock };
  let service: StockService;
  const run = <T>(fn: () => Promise<T>, ctx: RequestContext = CTX): Promise<T> =>
    store.run(ctx, async () => await fn());

  beforeEach(() => {
    db = fakeDb();
    ledger = {
      recordPurchase: jest.fn(() =>
        Promise.resolve({
          transactionId: 'tx-1',
          inventoryItemId: 'beef',
          quantityDelta: D('0.5'),
          stockAfter: D('8'),
          unitCost: D('420'),
          avgUnitCost: D('401.29'),
        }),
      ),
    };
    service = new StockService(
      db as unknown as TenantDb,
      store,
      ledger as unknown as LedgerService,
    );
  });

  it('lists every item with status, expected stock and MIXED figures', async () => {
    const rows = await run(() => service.listStock({}));
    const by = new Map(rows.map((r) => [r.inventoryItemId, r]));
    expect(by.get('beef')).toMatchObject({
      status: 'in-stock',
      currentStock: '7.500',
      expectedStock: '7.500', // snapshot 7 + 0.5 since
      lowStockThreshold: '5.000',
      avgUnitCost: '400.0000',
      standardUnitCost: '420.0000',
      lastCountedAt: '2026-11-05T20:00:00.000Z',
    });
    expect(by.get('buns')).toMatchObject({
      status: 'negative',
      expectedStock: '-2.000',
      lastCountedAt: null,
    });
    expect(by.get('cheese')).toMatchObject({ status: 'low-stock' });
    expect(by.get('gone')).toMatchObject({ status: 'out-of-stock', expectedStock: '0.000' });
    expect(by.get('sauce')).toMatchObject({
      status: 'derived',
      currentStock: null,
      derivedStock: '4.000',
      limitingItemId: 'cheese',
      components: [
        { inventoryItemId: 'beef', name: 'Beef', quantityPerUnit: '0.500', unit: 'KG' },
        { inventoryItemId: 'cheese', name: 'Cheese', quantityPerUnit: '250.000', unit: 'G' },
      ],
    });
    expect(Object.keys(by.get('beef')!)).not.toContain('lastCountQuantity');
  });

  it('filters by status and passes the type to the query', async () => {
    const rows = await run(() => service.listStock({ status: 'negative', type: 'READY' }));
    expect(rows.map((r) => r.inventoryItemId)).toEqual(['buns']);
    expect(db.inventoryItem.findMany.mock.calls[0]).toMatchObject([
      { where: { isActive: true, type: 'READY' } },
    ]);
  });

  it('lists low stock worst first: negative, out of stock, low', async () => {
    const rows = await run(() => service.listLowStock());
    expect(rows.map((r) => [r.inventoryItemId, r.status])).toEqual([
      ['buns', 'negative'],
      ['gone', 'out-of-stock'],
      ['cheese', 'low-stock'],
    ]);
  });

  it('shows how expected stock is built up for one item, and 404s an unknown one', async () => {
    expect(await run(() => service.getStockItem('beef'))).toMatchObject({
      lastCountQuantity: '7.000',
      changeSinceLastCount: '0.500',
      expectedStock: '7.500',
    });
    expect(await code(run(() => service.getStockItem('nope')))).toBe(
      '404 INVENTORY_ITEM_NOT_FOUND',
    );
  });

  it('needs a branch for every stock route', async () => {
    const noBranch = { ...CTX, branchId: null };
    const calls: (() => Promise<unknown>)[] = [
      () => service.listStock({}),
      () => service.listLowStock(),
      () => service.getStockItem('beef'),
      () => service.restock('beef', { quantity: '1' }),
    ];
    for (const call of calls) {
      expect(await code(run(call, noBranch))).toBe('400 BRANCH_REQUIRED');
    }
    expect(ledger.recordPurchase).not.toHaveBeenCalled();
  });

  it('hands a restock to the ledger in one transaction and formats the result', async () => {
    const result = await run(() =>
      service.restock('beef', { quantity: '500', unit: 'G', unitCost: '0.42', note: 'invoice 7' }),
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect((ledger.recordPurchase.mock.calls[0] as unknown[])[1]).toEqual({
      branchId: 'branch-1',
      inventoryItemId: 'beef',
      quantity: '500',
      unit: 'G',
      unitCost: '0.42',
      note: 'invoice 7',
      actorId: 'manager-1',
    });
    expect(result).toEqual({
      transactionId: 'tx-1',
      inventoryItemId: 'beef',
      quantityDelta: '0.500',
      unitCost: '420.0000',
      stockAfter: '8.000',
      avgUnitCost: '401.2900',
    });
  });

  describe('servableMenuItems', () => {
    it('treats everything as available without a branch or without items, querying nothing', async () => {
      expect(await run(() => service.servableMenuItems(['m1'], null))).toEqual(
        new Map([['m1', true]]),
      );
      expect(await run(() => service.servableMenuItems([], 'branch-1'))).toEqual(new Map());
      expect(db.menuItemIngredient.findMany).not.toHaveBeenCalled();
    });

    it('checks one serving per item against the branch stock', async () => {
      db.menuItemIngredient.findMany.mockResolvedValue([
        { menuItemId: 'burger', inventoryItemId: 'beef', quantity: D('150'), unit: 'G' },
        { menuItemId: 'bun-only', inventoryItemId: 'buns', quantity: D('1'), unit: 'PCS' },
        { menuItemId: 'saucy', inventoryItemId: 'sauce', quantity: D('100'), unit: 'ML' },
      ]);
      const result = await run(() =>
        service.servableMenuItems(['burger', 'bun-only', 'saucy', 'water'], 'branch-1'),
      );
      expect(Object.fromEntries(result)).toEqual({
        burger: true, // 0.15 KG of 7.5
        'bun-only': false, // buns at -2
        saucy: true, // 0.05 KG beef, 0.025 KG cheese
        water: true, // no recipe
      });
    });

    it('marks an item whose recipe cannot be expanded as unavailable', async () => {
      db.menuItemIngredient.findMany.mockResolvedValue([
        { menuItemId: 'odd', inventoryItemId: 'buns', quantity: D('5'), unit: 'G' }, // wrong dimension
      ]);
      expect(await run(() => service.servableMenuItems(['odd'], 'branch-1'))).toEqual(
        new Map([['odd', false]]),
      );
    });
  });
});

describe('StockController', () => {
  it('hands every route to the service', async () => {
    const service = {
      listStock: jest.fn().mockResolvedValue('list'),
      listLowStock: jest.fn().mockResolvedValue('low'),
      getStockItem: jest.fn().mockResolvedValue('one'),
      restock: jest.fn().mockResolvedValue('restocked'),
    };
    const controller = new StockController(service as unknown as StockService);
    await expect(controller.listStock({ status: 'low-stock' })).resolves.toBe('list');
    await expect(controller.listLowStock()).resolves.toBe('low');
    await expect(controller.getStockItem('i')).resolves.toBe('one');
    await expect(controller.restockItem('i', { quantity: '1' })).resolves.toBe('restocked');
    expect(service.restock).toHaveBeenCalledWith('i', { quantity: '1' });
  });
});
