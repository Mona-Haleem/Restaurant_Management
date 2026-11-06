import { parseDecimal } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../context/request-context';
import { RequestContextStore } from '../../context/request-context.store';
import type { TenantDb } from '../../prisma/tenant-prisma';
import type { LedgerService } from '../inventory/ledger.service';
import { OrdersService } from './orders.service';
import { hashTrackingToken } from './tracking-token';

// Unit tests for the service's own decisions (branch rules, placer, error mapping, when the
// ledger is called). Real queries, locking and concurrency are proven against Postgres in
// test/orders.e2e-spec.ts; this fake only records what the service asks for.

const STAGES = [
  { key: 'b', position: 2, cancellable: false, deductsInventory: true },
  { key: 'a', position: 1, cancellable: true, deductsInventory: false },
];
const WORKER: RequestContext = {
  tenantId: 't',
  tenantSlug: 'nile-bites',
  tenantName: 'Nile Bites',
  isDemoTenant: true,
  branchId: 'branch-1',
  actor: { id: 'worker', name: 'Omar', role: 'WORKER' },
};
const GUEST: RequestContext = { ...WORKER, actor: null };
const ADMIN_NO_BRANCH: RequestContext = {
  ...WORKER,
  branchId: null,
  actor: { id: 'admin', name: 'Mona', role: 'ADMIN' },
};

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  branchId: 'branch-1',
  stageKey: 'a',
  canceledAt: null,
  placedByType: 'STAFF',
  placedById: 'worker',
  total: parseDecimal('10'),
  note: null,
  createdAt: new Date('2026-11-06T10:00:00Z'),
  updatedAt: new Date('2026-11-06T10:00:00Z'),
  ...over,
});

function fakeDb() {
  const db = {
    orderWorkflowStage: { findMany: jest.fn().mockResolvedValue(STAGES) },
    menuItem: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'm1', name: 'Bowl', price: parseDecimal('42.50') }]),
    },
    order: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(order()),
      findUniqueOrThrow: jest.fn().mockResolvedValue(order()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderItem: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    orderStageHistory: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return db;
}

describe('OrdersService', () => {
  let db: ReturnType<typeof fakeDb>;
  let ledger: { deductOrder: jest.Mock };
  let store: RequestContextStore;
  let service: OrdersService;
  const as = <T>(ctx: RequestContext, fn: () => Promise<T>) => store.run(ctx, fn);

  async function failure(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
      return 'OK';
    } catch (error) {
      if (error instanceof AppException) return `${error.getStatus()} ${error.code}`;
      throw error;
    }
  }

  beforeEach(() => {
    db = fakeDb();
    ledger = { deductOrder: jest.fn().mockResolvedValue({ alreadyDeducted: false }) };
    store = new RequestContextStore();
    service = new OrdersService(
      db as unknown as TenantDb,
      store,
      ledger as unknown as LedgerService,
    );
  });

  it('reads the workflow sorted by position', async () => {
    await as(WORKER, () => service.getWorkflow());
    expect(db.orderWorkflowStage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { position: 'asc' } }),
    );
  });

  describe('placeOrder', () => {
    const dto = { items: [{ menuItemId: 'm1', quantity: 2 }], note: '' };

    it('a guest order is GUEST, at the lowest position, with a hashed token', async () => {
      const placed = await as(GUEST, () => service.placeOrder(dto));
      const calls = db.order.create.mock.calls as [{ data: Record<string, unknown> }][];
      const data = calls[0]![0].data;
      expect(data).toMatchObject({
        tenantId: 't',
        branchId: 'branch-1',
        stageKey: 'a',
        placedByType: 'GUEST',
        placedById: null,
        note: null,
      });
      expect((data.total as { toFixed: (n: number) => string }).toFixed(2)).toBe('85.00');
      expect(placed.trackingToken).toEqual(expect.any(String));
      expect(data.trackingTokenHash).toBe(hashTrackingToken(placed.trackingToken!));
      expect(db.orderStageHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'PLACED',
          toStageKey: 'a',
          actorId: null,
        }) as unknown,
      });
    });

    it('a staff order is STAFF with the actor and no token', async () => {
      const placed = await as(WORKER, () => service.placeOrder({ ...dto, note: 'hi' }));
      expect(db.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          placedByType: 'STAFF',
          placedById: 'worker',
          trackingTokenHash: null,
          note: 'hi',
        }) as unknown,
      });
      expect(placed.trackingToken).toBeNull();
    });

    it('needs a branch', async () => {
      expect(await failure(as(ADMIN_NO_BRANCH, () => service.placeOrder(dto)))).toBe(
        '400 BRANCH_REQUIRED',
      );
    });

    it('lists unavailable items', async () => {
      const promise = as(GUEST, () =>
        service.placeOrder({
          items: [
            { menuItemId: 'm1', quantity: 1 },
            { menuItemId: 'x', quantity: 1 },
          ],
        }),
      );
      await expect(promise).rejects.toMatchObject({ details: { menuItemIds: ['x'] } });
      expect(db.order.create).not.toHaveBeenCalled();
    });

    it('refuses a total the column cannot hold', async () => {
      db.menuItem.findMany.mockResolvedValue([
        { id: 'm1', name: 'Gold', price: parseDecimal('9999999999.99') },
      ]);
      expect(await failure(as(GUEST, () => service.placeOrder(dto)))).toBe(
        '400 ORDER_TOTAL_TOO_LARGE',
      );
    });
  });

  describe('advanceOrder', () => {
    it('calls the ledger in the same transaction when the next stage deducts', async () => {
      await as(WORKER, () => service.advanceOrder('o1'));
      expect(db.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', stageKey: 'a', canceledAt: null },
        data: { stageKey: 'b' },
      });
      expect(ledger.deductOrder).toHaveBeenCalledWith(db, { orderId: 'o1', actorId: 'worker' });
      expect(db.orderStageHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ADVANCED',
          fromStageKey: 'a',
          toStageKey: 'b',
        }) as unknown,
      });
    });

    it('does not call the ledger when the next stage does not deduct', async () => {
      db.orderWorkflowStage.findMany.mockResolvedValue(
        STAGES.map((s) => ({ ...s, deductsInventory: false })),
      );
      await as(WORKER, () => service.advanceOrder('o1'));
      expect(ledger.deductOrder).not.toHaveBeenCalled();
    });

    it('maps refused plans and lost races to 409s, writing nothing', async () => {
      db.order.findFirst.mockResolvedValueOnce(order({ stageKey: 'b' }));
      expect(await failure(as(WORKER, () => service.advanceOrder('o1')))).toBe(
        '409 ORDER_AT_LAST_STAGE',
      );
      db.order.findFirst.mockResolvedValueOnce(order({ canceledAt: new Date() }));
      expect(await failure(as(WORKER, () => service.advanceOrder('o1')))).toBe(
        '409 ORDER_CANCELED',
      );
      db.order.updateMany.mockResolvedValueOnce({ count: 0 });
      expect(await failure(as(WORKER, () => service.advanceOrder('o1')))).toBe(
        '409 ORDER_STAGE_CHANGED',
      );
      expect(ledger.deductOrder).not.toHaveBeenCalled();
      expect(db.orderStageHistory.create).not.toHaveBeenCalled();
    });

    it('scopes non-ADMIN staff to their branch, an ADMIN to the tenant', async () => {
      await as(WORKER, () => service.advanceOrder('o1'));
      expect(db.order.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: 'o1', branchId: 'branch-1' } }),
      );
      await as(ADMIN_NO_BRANCH, () => service.advanceOrder('o1'));
      expect(db.order.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: 'o1' } }),
      );
      db.order.findFirst.mockResolvedValueOnce(null);
      expect(await failure(as(WORKER, () => service.advanceOrder('o9')))).toBe(
        '404 ORDER_NOT_FOUND',
      );
    });

    it('a staff member without a branch finds nothing', async () => {
      const lost: RequestContext = { ...WORKER, branchId: null };
      expect(await failure(as(lost, () => service.advanceOrder('o1')))).toBe('404 ORDER_NOT_FOUND');
      expect(db.order.findFirst).not.toHaveBeenCalled();
    });

    it('is refused without a staff actor', async () => {
      expect(await failure(as(GUEST, () => service.advanceOrder('o1')))).toBe('401 AUTH_REQUIRED');
    });
  });

  describe('cancelling', () => {
    it('staff cancel sets canceled_at with a compare-and-set and records the actor', async () => {
      await as(WORKER, () => service.cancelOrder('o1'));
      expect(db.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', stageKey: 'a', canceledAt: null },
        data: { canceledAt: expect.any(Date) as unknown },
      });
      expect(db.orderStageHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CANCELED',
          fromStageKey: 'a',
          toStageKey: null,
          actorId: 'worker',
        }) as unknown,
      });
      expect(ledger.deductOrder).not.toHaveBeenCalled();
    });

    it('refuses a stage that is not cancellable', async () => {
      db.order.findFirst.mockResolvedValueOnce(order({ stageKey: 'b' }));
      expect(await failure(as(WORKER, () => service.cancelOrder('o1')))).toBe(
        '409 ORDER_NOT_CANCELLABLE',
      );
    });

    it('a guest cancels by token hash, with a NULL actor', async () => {
      await as(GUEST, () => service.cancelTrackedOrder('tok'));
      expect(db.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { trackingTokenHash: hashTrackingToken('tok') } }),
      );
      expect(db.orderStageHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'CANCELED', actorId: null }) as unknown,
      });
    });

    it('an unknown token is a plain 404', async () => {
      db.order.findFirst.mockResolvedValueOnce(null);
      expect(await failure(as(GUEST, () => service.cancelTrackedOrder('nope')))).toBe(
        '404 ORDER_NOT_FOUND',
      );
    });
  });

  it('maps rows to the wire shape (decimals as strings, derived status)', async () => {
    db.order.findUniqueOrThrow.mockResolvedValue(
      order({ canceledAt: new Date('2026-11-06T11:00:00Z') }),
    );
    db.orderItem.findMany.mockResolvedValue([
      {
        id: 'i1',
        menuItemId: 'm1',
        name: 'Bowl',
        unitPrice: parseDecimal('42.5'),
        quantity: 2,
        lineTotal: parseDecimal('85'),
      },
    ]);
    const dto = await as(WORKER, () => service.cancelOrder('o1'));
    expect(dto).toMatchObject({
      status: 'cancelled',
      stageKey: 'a',
      canceledAt: '2026-11-06T11:00:00.000Z',
      total: '10.00',
      placedBy: { actorType: 'STAFF', actorId: 'worker' },
      items: [{ unitPrice: '42.50', lineTotal: '85.00', quantity: 2 }],
    });
  });
});
