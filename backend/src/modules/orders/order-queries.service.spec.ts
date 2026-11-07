import type { Prisma } from '../../generated/prisma/client';
import { parseDecimal } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../context/request-context';
import { RequestContextStore } from '../../context/request-context.store';
import type { TenantDb } from '../../prisma/tenant-prisma';
import { ALL_SCOPE_LIMIT, OrderQueriesService } from './order-queries.service';

// The service's own decisions: who sees which branch, the active/all filters, the 304 path
// (no order rows read when the tag matches) and what a guest sees. The real queries and
// polling against Postgres are proven in test/order-queries.e2e-spec.ts.

type Decimal = Prisma.Decimal;
const D = (v: string): Decimal => parseDecimal(v);
const T = new Date('2026-11-06T10:00:00.000Z');

const ctx = (
  role: 'ADMIN' | 'MANAGER' | 'WORKER' | null,
  branchId: string | null = 'b1',
): RequestContext => ({
  tenantId: 't',
  tenantSlug: 's',
  tenantName: 'S',
  isDemoTenant: true,
  branchId,
  actor: role ? { id: `${role}-1`, name: 'n', role } : null,
});

const ORDER = {
  id: 'o1',
  branchId: 'b1',
  stageKey: 'ready',
  canceledAt: null,
  placedByType: 'GUEST',
  placedById: null,
  total: D('10'),
  note: null,
  createdAt: T,
  updatedAt: T,
};
const ITEM = {
  id: 'i1',
  menuItemId: 'm1',
  name: 'Dish',
  unitPrice: D('10'),
  quantity: 1,
  lineTotal: D('10'),
};

function fakeDb() {
  return {
    orderWorkflowStage: {
      findMany: jest.fn().mockResolvedValue([
        { key: 'new', label: 'New', position: 1, cancellable: true },
        { key: 'ready', label: 'Ready', position: 2, cancellable: false },
        { key: 'done', label: 'Done', position: 3, cancellable: false },
      ]),
    },
    order: {
      groupBy: jest
        .fn()
        .mockResolvedValue([{ stageKey: 'ready', _count: { _all: 1 }, _max: { updatedAt: T } }]),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([{ ...ORDER, items: [ITEM] }]),
      findFirst: jest.fn().mockResolvedValue(ORDER),
    },
    orderItem: { findMany: jest.fn().mockResolvedValue([ITEM]) },
    orderStageHistory: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { action: 'PLACED', fromStageKey: null, toStageKey: 'new', actorId: null, createdAt: T },
        ]),
    },
  };
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

describe('OrderQueriesService', () => {
  const store = new RequestContextStore();
  let db: ReturnType<typeof fakeDb>;
  let service: OrderQueriesService;
  const as = <T>(c: RequestContext, fn: () => Promise<T>): Promise<T> =>
    store.run(c, async () => await fn());
  const whereOf = (mock: jest.Mock): unknown =>
    (mock.mock.calls[0] as [{ where: unknown }])[0].where;
  const firstArg = (mock: jest.Mock): unknown => (mock.mock.calls[0] as unknown[])[0];

  beforeEach(() => {
    db = fakeDb();
    service = new OrderQueriesService(db as unknown as TenantDb, store);
  });

  describe('listOrders', () => {
    it('shows active orders of the own branch, oldest first, without the last stage', async () => {
      const polled = await as(ctx('WORKER'), () => service.listOrders({}));
      expect(whereOf(db.order.groupBy)).toEqual({
        AND: [{ branchId: 'b1' }, { canceledAt: null }, { stageKey: { not: 'done' } }],
      });
      expect(firstArg(db.order.findMany)).toMatchObject({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(polled.body).toEqual([expect.objectContaining({ id: 'o1', total: '10.00' })]);
      expect(polled.etag).toMatch(/^W\//);
    });

    it('all scope: every order, newest first, capped', async () => {
      await as(ctx('MANAGER'), () => service.listOrders({ scope: 'all', stageKey: 'ready' }));
      expect(whereOf(db.order.groupBy)).toEqual({
        AND: [{ branchId: 'b1' }, { stageKey: 'ready' }],
      });
      expect(firstArg(db.order.findMany)).toMatchObject({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ALL_SCOPE_LIMIT,
      });
    });

    it('answers "not modified" without reading any order when the tag still matches', async () => {
      const first = await as(ctx('WORKER'), () => service.listOrders({}));
      db.order.findMany.mockClear();
      const again = await as(ctx('WORKER'), () => service.listOrders({}, first.etag));
      expect(again).toEqual({ etag: first.etag, body: null });
      expect(db.order.findMany).not.toHaveBeenCalled();
    });

    it('gives every scope its own tag', async () => {
      const own = await as(ctx('WORKER'), () => service.listOrders({}));
      const all = await as(ctx('WORKER'), () => service.listOrders({ scope: 'all' }));
      const admin = await as(ctx('ADMIN', null), () => service.listOrders({}));
      expect(new Set([own.etag, all.etag, admin.etag]).size).toBe(3);
    });

    it('changes the tag when an order moves, even if count and latest change look the same', async () => {
      // A move that commits after a newer change keeps count and max(updated_at): the stage
      // split must still change the tag (ADR 0024).
      const g = (split: [string, number][]) =>
        split.map(([stageKey, n]) => ({ stageKey, _count: { _all: n }, _max: { updatedAt: T } }));
      db.order.groupBy.mockResolvedValue(
        g([
          ['new', 2],
          ['ready', 1],
        ]),
      );
      const before = await as(ctx('WORKER'), () => service.listOrders({ scope: 'all' }));
      db.order.groupBy.mockResolvedValue(
        g([
          ['new', 1],
          ['ready', 2],
        ]),
      );
      const moved = await as(ctx('WORKER'), () =>
        service.listOrders({ scope: 'all' }, before.etag),
      );
      expect(moved.etag).not.toBe(before.etag);
      expect(moved.body).not.toBeNull();
    });

    it('changes the tag when an order is cancelled (scope=all keeps cancelled orders)', async () => {
      const before = await as(ctx('WORKER'), () => service.listOrders({ scope: 'all' }));
      db.order.count.mockResolvedValue(1);
      const after = await as(ctx('WORKER'), () => service.listOrders({ scope: 'all' }));
      expect(after.etag).not.toBe(before.etag);
      expect(whereOf(db.order.count)).toEqual({
        AND: [{ branchId: 'b1' }, { canceledAt: { not: null } }],
      });
    });

    it('does not count cancelled orders for the active board (they are excluded)', async () => {
      await as(ctx('WORKER'), () => service.listOrders({}));
      expect(db.order.count).not.toHaveBeenCalled();
    });

    it('lets ADMIN see every branch or one, and keeps others to their own', async () => {
      await as(ctx('ADMIN', null), () => service.listOrders({}));
      expect(whereOf(db.order.groupBy)).toEqual({
        AND: [{ canceledAt: null }, { stageKey: { not: 'done' } }],
      });
      db.order.groupBy.mockClear();
      await as(ctx('ADMIN', null), () => service.listOrders({ branchId: 'b2', scope: 'all' }));
      expect(whereOf(db.order.groupBy)).toEqual({ AND: [{ branchId: 'b2' }] });

      expect(await code(as(ctx('WORKER'), () => service.listOrders({ branchId: 'b2' })))).toBe(
        '403 BRANCH_FORBIDDEN',
      );
      expect(await code(as(ctx('WORKER'), () => service.listOrders({ branchId: 'b1' })))).toBe(
        'OK',
      );
      expect(await code(as(ctx('MANAGER', null), () => service.listOrders({})))).toBe(
        '400 BRANCH_REQUIRED',
      );
    });

    it('copes with an empty workflow (no last stage to exclude)', async () => {
      db.orderWorkflowStage.findMany.mockResolvedValue([]);
      await as(ctx('WORKER'), () => service.listOrders({}));
      expect(whereOf(db.order.groupBy)).toEqual({
        AND: [{ branchId: 'b1' }, { canceledAt: null }],
      });
    });
  });

  describe('getOrder', () => {
    it('returns items and history, and "not modified" for the same tag', async () => {
      const polled = await as(ctx('WORKER'), () => service.getOrder('o1'));
      expect(polled.body).toMatchObject({
        id: 'o1',
        items: [{ name: 'Dish' }],
        history: [{ action: 'PLACED', toStageKey: 'new', at: T.toISOString() }],
      });
      expect(whereOf(db.order.findFirst)).toEqual({ id: 'o1', branchId: 'b1' });
      db.orderItem.findMany.mockClear();
      expect(await as(ctx('WORKER'), () => service.getOrder('o1', polled.etag))).toEqual({
        etag: polled.etag,
        body: null,
      });
      expect(db.orderItem.findMany).not.toHaveBeenCalled();
    });

    it('lets ADMIN read any branch; 404s unknown orders and staff without a branch', async () => {
      await as(ctx('ADMIN', null), () => service.getOrder('o1'));
      expect(whereOf(db.order.findFirst)).toEqual({ id: 'o1' });
      expect(await code(as(ctx('MANAGER', null), () => service.getOrder('o1')))).toBe(
        '404 ORDER_NOT_FOUND',
      );
      db.order.findFirst.mockResolvedValue(null);
      expect(await code(as(ctx('WORKER'), () => service.getOrder('nope')))).toBe(
        '404 ORDER_NOT_FOUND',
      );
    });
  });

  describe('getTrackedOrder', () => {
    it('shows status, items and stages, with no internal fields', async () => {
      const polled = await as(ctx(null), () => service.getTrackedOrder('t'.repeat(43)));
      expect(polled.body).toEqual({
        stageKey: 'ready',
        status: 'ready',
        canceledAt: null,
        total: '10.00',
        note: null,
        items: [{ name: 'Dish', quantity: 1, unitPrice: '10.00', lineTotal: '10.00' }],
        stages: [
          { key: 'new', label: 'New', position: 1, cancellable: true },
          { key: 'ready', label: 'Ready', position: 2, cancellable: false },
          { key: 'done', label: 'Done', position: 3, cancellable: false },
        ],
        createdAt: T.toISOString(),
        updatedAt: T.toISOString(),
      });
    });

    it('marks a cancelled order, answers "not modified", and 404s an unknown token', async () => {
      db.order.findFirst.mockResolvedValue({ ...ORDER, canceledAt: T });
      const polled = await as(ctx(null), () => service.getTrackedOrder('x'));
      expect(polled.body).toMatchObject({ status: 'cancelled', canceledAt: T.toISOString() });
      db.orderItem.findMany.mockClear();
      expect(
        (await as(ctx(null), () => service.getTrackedOrder('x', polled.etag))).body,
      ).toBeNull();
      expect(db.orderItem.findMany).not.toHaveBeenCalled();
      db.order.findFirst.mockResolvedValue(null);
      expect(await code(as(ctx(null), () => service.getTrackedOrder('x')))).toBe(
        '404 ORDER_NOT_FOUND',
      );
    });
  });
});
