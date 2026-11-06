import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AppException } from '../src/common/errors/app-exception';
import type { RequestContext } from '../src/context/request-context';
import { RequestContextStore } from '../src/context/request-context.store';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { LedgerService } from '../src/modules/inventory/ledger.service';
import { TENANT_DB, type TenantDb } from '../src/prisma/tenant-prisma';
import { ensureSeedTenants, unscopedClient, type SeedTenants } from './seed-tenants';
import { testConfig } from './test-config';

// B701 acceptance on real Postgres (required suites, ARCHITECTURE §8 — never delete):
// - two simultaneous deliveries of the same order deduct once;
// - a failure mid-cascade leaves no partial rows;
// - stock = latest snapshot + transactions since, over randomized sequences.
// The fixture uses its own items (no low-stock threshold), so other suites' seed checks hold.

type Tx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0];
const D = (v: string | number) => new Prisma.Decimal(v);
const run = Date.now().toString(36);

interface Fixture {
  flour: string;
  oil: string;
  buns: string;
  sauce: string;
  pie: string;
  bun: string;
}

describe('ledger service (B701)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let seed: SeedTenants;
  let ledger: LedgerService;
  let db: TenantDb;
  let store: RequestContextStore;
  let fx: Fixture;
  let ctx: RequestContext;
  let tenantId: string;
  let branchId: string;
  let workerId: string;

  /** Runs `fn` in one transaction of the tenant-scoped client, as tenant A. */
  const inTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    store.run(ctx, async () => await db.$transaction((tx) => fn(tx), { timeout: 30_000 }));

  const stockOf = async (itemId: string): Promise<string | null> => {
    const row = await prisma.branchStock.findUnique({
      where: { tenantId_branchId_inventoryItemId: { tenantId, branchId, inventoryItemId: itemId } },
    });
    return row ? row.currentStock.toFixed(3) : null;
  };

  async function createOrder(lines: [menuItemId: string, quantity: number][]): Promise<string> {
    const orderId = randomUUID();
    await prisma.order.create({
      data: {
        id: orderId,
        tenantId,
        branchId,
        stageKey: 'delivered',
        placedByType: 'STAFF',
        placedById: workerId,
        total: D(10).times(lines.reduce((n, [, q]) => n + q, 0)),
      },
    });
    await prisma.orderItem.createMany({
      data: lines.map(([menuItemId, quantity]) => ({
        tenantId,
        orderId,
        menuItemId,
        name: 'Ledger test',
        unitPrice: '10.00',
        quantity,
        lineTotal: D(10).times(quantity),
      })),
    });
    return orderId;
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

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = await ensureSeedTenants(prisma);
    tenantId = seed.a.tenant.id;
    branchId = seed.a.branches[0]!.id;
    const worker = seed.a.users.find((u) => u.role === 'WORKER')!;
    workerId = worker.id;
    ctx = {
      tenantId,
      tenantSlug: seed.a.tenant.slug,
      tenantName: String(seed.a.tenant.name),
      isDemoTenant: true,
      branchId,
      actor: { id: worker.id, name: worker.name, role: 'WORKER' },
    };

    // Fixture: two RAW items with stock and an average cost, one READY item never stocked,
    // a MIXED sauce, and two menu items. Purchases back the opening stock (invariant holds).
    const item = (
      name: string,
      type: 'RAW' | 'READY' | 'MIXED',
      unit: 'KG' | 'L' | 'PCS',
      cost?: string,
    ) => ({
      id: randomUUID(),
      tenantId,
      name: `${name} ${run}`,
      type,
      unit,
      standardUnitCost: cost ?? null,
    });
    const flour = item('Ledger Flour', 'RAW', 'KG', '22.0000');
    const oil = item('Ledger Oil', 'RAW', 'L', '85.0000');
    const buns = item('Ledger Buns', 'READY', 'PCS', '4.5000');
    const sauce = item('Ledger Sauce', 'MIXED', 'L');
    await prisma.inventoryItem.createMany({ data: [flour, oil, buns, sauce] });
    await prisma.inventoryItemComponent.createMany({
      data: [
        { tenantId, mixedItemId: sauce.id, componentItemId: flour.id, quantity: '0.2', unit: 'KG' },
        { tenantId, mixedItemId: sauce.id, componentItemId: oil.id, quantity: '500', unit: 'ML' },
      ],
    });
    for (const [id, qty, cost] of [
      [flour.id, '10', '20.0000'],
      [oil.id, '5', '80.0000'],
    ] as const) {
      await prisma.inventoryTransaction.create({
        data: {
          tenantId,
          branchId,
          inventoryItemId: id,
          type: 'PURCHASE',
          quantityDelta: qty,
          unitCost: cost,
          actorId: workerId,
        },
      });
      await prisma.branchStock.create({
        data: { tenantId, branchId, inventoryItemId: id, currentStock: qty, avgUnitCost: cost },
      });
    }
    const categoryId = seed.a.categories[0]!.id;
    const pie = {
      id: randomUUID(),
      tenantId,
      categoryId,
      name: `Ledger Pie ${run}`,
      price: '50.00',
    };
    const bun = {
      id: randomUUID(),
      tenantId,
      categoryId,
      name: `Ledger Bun ${run}`,
      price: '5.00',
    };
    await prisma.menuItem.createMany({ data: [pie, bun] });
    await prisma.menuItemIngredient.createMany({
      data: [
        // Pie: 250 G flour + 100 ML sauce (0.02 KG flour, 0.05 L oil) + 10 ML oil
        { tenantId, menuItemId: pie.id, inventoryItemId: flour.id, quantity: '250', unit: 'G' },
        { tenantId, menuItemId: pie.id, inventoryItemId: sauce.id, quantity: '100', unit: 'ML' },
        { tenantId, menuItemId: pie.id, inventoryItemId: oil.id, quantity: '10', unit: 'ML' },
        { tenantId, menuItemId: bun.id, inventoryItemId: buns.id, quantity: '1', unit: 'PCS' },
      ],
    });
    fx = { flour: flour.id, oil: oil.id, buns: buns.id, sauce: sauce.id, pie: pie.id, bun: bun.id };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testConfig())],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ledger = app.get(LedgerService);
    db = app.get<TenantDb>(TENANT_DB);
    store = app.get(RequestContextStore);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('deductOrder', () => {
    it('cascades MIXED items, aggregates per item, and goes negative when it must', async () => {
      const before = { flour: await stockOf(fx.flour), oil: await stockOf(fx.oil) };
      const orderId = await createOrder([
        [fx.pie, 2],
        [fx.bun, 3],
      ]);
      const result = await inTx((tx) => ledger.deductOrder(tx, { orderId, actorId: workerId }));
      expect(result.alreadyDeducted).toBe(false);

      const rows = await prisma.inventoryTransaction.findMany({
        where: { relatedOrderId: orderId },
        select: {
          inventoryItemId: true,
          type: true,
          quantityDelta: true,
          unitCost: true,
          actorId: true,
          branchId: true,
        },
      });
      const byItem = new Map(rows.map((r) => [r.inventoryItemId, r]));
      // 2 x (0.25 + 0.1 L x 0.2) flour, 2 x (0.1 L x 0.5 + 0.01) oil, 3 buns; nothing for the sauce.
      expect(rows).toHaveLength(3);
      expect(byItem.get(fx.flour)?.quantityDelta.toFixed(3)).toBe('-0.540');
      expect(byItem.get(fx.oil)?.quantityDelta.toFixed(3)).toBe('-0.120');
      expect(byItem.get(fx.buns)?.quantityDelta.toFixed(3)).toBe('-3.000');
      expect(byItem.has(fx.sauce)).toBe(false);
      expect(
        rows.every(
          (r) => r.type === 'CONSUMPTION' && r.actorId === workerId && r.branchId === branchId,
        ),
      ).toBe(true);
      // Cost: the average where there is one, else the item's standard cost (ADR 0005).
      expect(byItem.get(fx.flour)?.unitCost?.toFixed(4)).toBe('20.0000');
      expect(byItem.get(fx.buns)?.unitCost?.toFixed(4)).toBe('4.5000');

      expect(await stockOf(fx.flour)).toBe(D(before.flour!).minus('0.54').toFixed(3));
      expect(await stockOf(fx.oil)).toBe(D(before.oil!).minus('0.12').toFixed(3));
      // Buns had no stock row: it is created and goes negative, and the result says so (ADR 0006).
      expect(await stockOf(fx.buns)).not.toBeNull();
      expect(result.negativeItemIds).toContain(fx.buns);
      expect(await prisma.branchStock.count({ where: { inventoryItemId: fx.sauce } })).toBe(0);
    });

    it('does nothing the second time (retry)', async () => {
      const orderId = await createOrder([[fx.pie, 1]]);
      await inTx((tx) => ledger.deductOrder(tx, { orderId, actorId: workerId }));
      const flour = await stockOf(fx.flour);
      const again = await inTx((tx) => ledger.deductOrder(tx, { orderId, actorId: workerId }));
      expect(again).toEqual({ alreadyDeducted: true, movements: [], negativeItemIds: [] });
      expect(await stockOf(fx.flour)).toBe(flour);
      expect(await prisma.inventoryTransaction.count({ where: { relatedOrderId: orderId } })).toBe(
        2,
      );
    });

    it('deducts once when two deliveries of the same order run at the same time', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const orderId = await createOrder([
          [fx.pie, 1],
          [fx.bun, 1],
        ]);
        const before = { flour: await stockOf(fx.flour), buns: await stockOf(fx.buns) };
        const results = await Promise.all([
          inTx((tx) => ledger.deductOrder(tx, { orderId, actorId: workerId })),
          inTx((tx) => ledger.deductOrder(tx, { orderId, actorId: workerId })),
        ]);
        expect(results.map((r) => r.alreadyDeducted).sort()).toEqual([false, true]);
        expect(
          await prisma.inventoryTransaction.count({ where: { relatedOrderId: orderId } }),
        ).toBe(3);
        expect(await stockOf(fx.flour)).toBe(D(before.flour!).minus('0.27').toFixed(3));
        expect(await stockOf(fx.buns)).toBe(D(before.buns!).minus('1').toFixed(3));
      }
    });

    it('deducts once even when the second delivery is open while the first holds the lock', async () => {
      // Deterministic overlap: A deducts and stays open until B's transaction has started its
      // own deduction, which must wait for A's lock and then find A's rows.
      const orderId = await createOrder([[fx.pie, 1]]);
      const before = await stockOf(fx.flour);
      let aDeducted!: () => void;
      let bStarted!: () => void;
      const aReady = new Promise<void>((resolve) => (aDeducted = resolve));
      const bReady = new Promise<void>((resolve) => (bStarted = resolve));
      const a = inTx(async (tx) => {
        const result = await ledger.deductOrder(tx, { orderId, actorId: workerId });
        aDeducted();
        await bReady;
        await new Promise((resolve) => setTimeout(resolve, 200)); // B is now blocked on the lock
        return result;
      });
      await aReady;
      const b = inTx((tx) => {
        bStarted();
        return ledger.deductOrder(tx, { orderId, actorId: workerId });
      });
      const [first, second] = await Promise.all([a, b]);
      expect([first.alreadyDeducted, second.alreadyDeducted]).toEqual([false, true]);
      expect(await stockOf(fx.flour)).toBe(D(before!).minus('0.27').toFixed(3));
    });

    it('keeps every deduction when different orders sharing items run at the same time', async () => {
      // No lost update and no deadlock: stock rows are locked in a fixed (id) order.
      const orders = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          createOrder([
            [fx.pie, 1],
            [fx.bun, i % 2 === 0 ? 1 : 2],
          ]),
        ),
      );
      const before = {
        flour: await stockOf(fx.flour),
        oil: await stockOf(fx.oil),
        buns: await stockOf(fx.buns),
      };
      const results = await Promise.all(
        orders.map((orderId) =>
          inTx((tx) => ledger.deductOrder(tx, { orderId, actorId: workerId })),
        ),
      );
      expect(results.every((r) => !r.alreadyDeducted)).toBe(true);
      expect(await stockOf(fx.flour)).toBe(D(before.flour!).minus(D('0.27').times(6)).toFixed(3));
      expect(await stockOf(fx.oil)).toBe(D(before.oil!).minus(D('0.06').times(6)).toFixed(3));
      expect(await stockOf(fx.buns)).toBe(D(before.buns!).minus(9).toFixed(3));
    });

    it('leaves no rows when the caller fails after the deduction (same transaction)', async () => {
      const orderId = await createOrder([[fx.pie, 1]]);
      const before = await Promise.all([fx.flour, fx.oil].map(stockOf));
      await expect(
        inTx(async (tx) => {
          await ledger.deductOrder(tx, { orderId, actorId: workerId });
          throw new Error('the order transition failed after the deduction');
        }),
      ).rejects.toThrow('after the deduction');
      expect(await prisma.inventoryTransaction.count({ where: { relatedOrderId: orderId } })).toBe(
        0,
      );
      expect(await Promise.all([fx.flour, fx.oil].map(stockOf))).toEqual(before);
    });

    it('leaves no partial rows when it fails mid-cascade', async () => {
      const orderId = await createOrder([
        [fx.pie, 1],
        [fx.bun, 1],
      ]);
      const before = await Promise.all([fx.flour, fx.oil, fx.buns].map(stockOf));
      let updates = 0;
      /** The transaction client, except that the 2nd stock update fails (a crash mid-cascade). */
      const faulty = (tx: Tx): Tx =>
        new Proxy(tx, {
          get(target, prop, receiver) {
            const value: unknown = Reflect.get(target, prop, receiver);
            if (prop !== 'branchStock') return value;
            return new Proxy(value as object, {
              get(stock, method, r) {
                const fn: unknown = Reflect.get(stock, method, r);
                if (method !== 'update' || typeof fn !== 'function') return fn;
                return (...args: unknown[]) => {
                  updates += 1;
                  if (updates === 2) throw new Error('simulated failure mid-cascade');
                  return (fn as (...a: unknown[]) => unknown).apply(stock, args);
                };
              },
            });
          },
        });
      await expect(
        inTx((tx) => ledger.deductOrder(faulty(tx), { orderId, actorId: workerId })),
      ).rejects.toThrow('simulated failure mid-cascade');
      expect(updates).toBe(2);
      expect(await prisma.inventoryTransaction.count({ where: { relatedOrderId: orderId } })).toBe(
        0,
      );
      expect(await Promise.all([fx.flour, fx.oil, fx.buns].map(stockOf))).toEqual(before);
    });

    it('leaves no partial rows when the ledger insert itself fails, after every stock update', async () => {
      const orderId = await createOrder([
        [fx.pie, 1],
        [fx.bun, 1],
      ]);
      const before = await Promise.all([fx.flour, fx.oil, fx.buns].map(stockOf));
      /** The transaction client, except that inserting the ledger rows fails. */
      const faulty = (tx: Tx): Tx =>
        new Proxy(tx, {
          get(target, prop, receiver) {
            const value: unknown = Reflect.get(target, prop, receiver);
            if (prop !== 'inventoryTransaction') return value;
            return new Proxy(value as object, {
              get(rows, method, r) {
                const fn: unknown = Reflect.get(rows, method, r);
                if (method !== 'createMany') return fn;
                return () => {
                  throw new Error('simulated failure writing ledger rows');
                };
              },
            });
          },
        });
      await expect(
        inTx((tx) => ledger.deductOrder(faulty(tx), { orderId, actorId: workerId })),
      ).rejects.toThrow('writing ledger rows');
      expect(await prisma.inventoryTransaction.count({ where: { relatedOrderId: orderId } })).toBe(
        0,
      );
      expect(await Promise.all([fx.flour, fx.oil, fx.buns].map(stockOf))).toEqual(before);
    });

    it('answers 404 ORDER_NOT_FOUND for an order of no tenant or of another tenant', async () => {
      expect(
        await code(
          inTx((tx) => ledger.deductOrder(tx, { orderId: randomUUID(), actorId: workerId })),
        ),
      ).toBe('404 ORDER_NOT_FOUND');
    });
  });

  it('the idempotency key is enforced by the database itself (§4)', async () => {
    const orderId = await createOrder([[fx.bun, 1]]);
    await inTx((tx) => ledger.deductOrder(tx, { orderId, actorId: workerId }));
    await expect(
      prisma.inventoryTransaction.create({
        data: {
          tenantId,
          branchId,
          inventoryItemId: fx.buns,
          type: 'CONSUMPTION',
          quantityDelta: '-1',
          relatedOrderId: orderId,
          actorId: workerId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  describe('recordWaste', () => {
    it('converts to the stock unit and writes one WASTE row with the reason', async () => {
      const before = await stockOf(fx.flour);
      const result = await inTx((tx) =>
        ledger.recordWaste(tx, {
          branchId,
          inventoryItemId: fx.flour,
          quantity: '500',
          unit: 'G',
          actorId: workerId,
          reason: 'Spilled bag',
        }),
      );
      const row = await prisma.inventoryTransaction.findUnique({
        where: { id: result.transactionId },
      });
      expect(row).toMatchObject({
        type: 'WASTE',
        note: 'Spilled bag',
        relatedOrderId: null,
        actorId: workerId,
      });
      expect(row?.quantityDelta.toFixed(3)).toBe('-0.500');
      expect(await stockOf(fx.flour)).toBe(D(before!).minus('0.5').toFixed(3));
      expect(result.stockAfter.toFixed(3)).toBe(await stockOf(fx.flour));
    });

    it.each([
      [
        'a MIXED item',
        () => ({ inventoryItemId: fx.sauce, quantity: '1', unit: 'L' }),
        '400 MIXED_ITEM_NOT_STOCKED',
      ],
      [
        'an unknown item',
        () => ({ inventoryItemId: randomUUID(), quantity: '1', unit: 'KG' }),
        '404 INVENTORY_ITEM_NOT_FOUND',
      ],
      [
        "another tenant's item",
        () => ({ inventoryItemId: seed.bInventoryItemId, quantity: '1', unit: 'KG' }),
        '404 INVENTORY_ITEM_NOT_FOUND',
      ],
      [
        'a unit from another dimension',
        () => ({ inventoryItemId: fx.flour, quantity: '1', unit: 'L' }),
        '400 UNIT_DIMENSION_MISMATCH',
      ],
      [
        'a quantity too precise for the stock unit',
        () => ({ inventoryItemId: fx.flour, quantity: '0.5', unit: 'G' }),
        '400 QUANTITY_TOO_PRECISE',
      ],
      [
        'a zero quantity',
        () => ({ inventoryItemId: fx.flour, quantity: '0', unit: 'KG' }),
        '400 QUANTITY_NOT_POSITIVE',
      ],
      [
        "another tenant's branch",
        () => ({
          inventoryItemId: fx.flour,
          quantity: '1',
          unit: 'KG',
          branchId: seed.b.branches[0]!.id,
        }),
        '400 BRANCH_NOT_FOUND',
      ],
    ] as const)('refuses %s', async (_case, input, expected) => {
      const before = await prisma.inventoryTransaction.count({ where: { tenantId } });
      const outcome = await code(
        inTx((tx) =>
          ledger.recordWaste(tx, {
            branchId,
            actorId: workerId,
            reason: 'test',
            ...input(),
          } as Parameters<LedgerService['recordWaste']>[1]),
        ),
      );
      expect(outcome).toBe(expected);
      expect(await prisma.inventoryTransaction.count({ where: { tenantId } })).toBe(before);
    });
  });

  describe('stock = latest snapshot + transactions since (randomized)', () => {
    /** Mulberry32, so a failing sequence can be replayed from its seed. */
    function prng(seedValue: number): () => number {
      let a = seedValue;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    async function takeSnapshot(itemId: string): Promise<void> {
      // What reconciliation (B902) will do: record the stock now, through the latest ledger row.
      const stock = await prisma.branchStock.findUnique({
        where: {
          tenantId_branchId_inventoryItemId: { tenantId, branchId, inventoryItemId: itemId },
        },
      });
      if (!stock) return;
      const latest = await prisma.inventoryTransaction.aggregate({
        _max: { seq: true },
        where: { tenantId, branchId, inventoryItemId: itemId },
      });
      await prisma.inventorySnapshot.create({
        data: {
          tenantId,
          branchId,
          inventoryItemId: itemId,
          quantity: stock.currentStock,
          throughSeq: latest._max.seq ?? 0n,
        },
      });
    }

    it.each([11, 2024, 77_777])(
      'holds after a random mix of deliveries, waste and counts (seed %i)',
      async (seedValue) => {
        const random = prng(seedValue);
        const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!;
        const wastes = [
          { inventoryItemId: fx.flour, unit: 'G' as const, max: 3000 },
          { inventoryItemId: fx.oil, unit: 'ML' as const, max: 2000 },
          { inventoryItemId: fx.buns, unit: 'PCS' as const, max: 6 },
        ];
        for (let step = 0; step < 40; step += 1) {
          const roll = random();
          if (roll < 0.45) {
            const orderId = await createOrder([
              [pick([fx.pie, fx.bun]), 1 + Math.floor(random() * 3)],
              [pick([fx.pie, fx.bun]), 1 + Math.floor(random() * 2)],
            ]);
            await inTx((tx) => ledger.deductOrder(tx, { orderId, actorId: workerId }));
          } else if (roll < 0.85) {
            const w = pick(wastes);
            await inTx((tx) =>
              ledger.recordWaste(tx, {
                branchId,
                inventoryItemId: w.inventoryItemId,
                quantity: String(1 + Math.floor(random() * w.max)),
                unit: w.unit,
                actorId: workerId,
                reason: `random ${seedValue}/${step}`,
              }),
            );
          } else {
            await takeSnapshot(pick([fx.flour, fx.oil, fx.buns]));
          }
        }

        // Checked in SQL, on the stored rows, for every fixture item.
        const rows = await prisma.$queryRaw<{ item: string; matches: boolean }[]>`
        SELECT s.inventory_item_id AS item,
               s.current_stock = (coalesce(snap.quantity, 0) + coalesce((
                 SELECT sum(x.quantity_delta) FROM inventory_transactions x
                  WHERE x.tenant_id = s.tenant_id AND x.branch_id = s.branch_id
                    AND x.inventory_item_id = s.inventory_item_id
                    AND x.seq > coalesce(snap.through_seq, 0)), 0)) AS matches
          FROM branch_stock s
          LEFT JOIN LATERAL (
            SELECT n.quantity, n.through_seq FROM inventory_snapshots n
             WHERE n.tenant_id = s.tenant_id AND n.branch_id = s.branch_id
               AND n.inventory_item_id = s.inventory_item_id
             ORDER BY n.through_seq DESC LIMIT 1) snap ON true
         WHERE s.inventory_item_id IN (${fx.flour}::uuid, ${fx.oil}::uuid, ${fx.buns}::uuid)`;
        expect(rows).toHaveLength(3);
        expect(rows.filter((r) => !r.matches)).toEqual([]);
      },
    );
  });
});
