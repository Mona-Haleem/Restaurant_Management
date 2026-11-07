import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { buildTenantSeed, type TenantSeed } from '../src/prisma/seed/build-seed';
import { DEMO_TENANT } from '../src/prisma/seed/demo-data';
import { seedId } from '../src/prisma/seed/seed-ids';
import { writeTenantSeed } from '../src/prisma/seed/write-seed';
import { bodyOf } from './http';
import { unscopedClient } from './seed-tenants';
import { testConfig } from './test-config';

// B1101 acceptance on real Postgres: each KPI matches the seed data exactly; a constructed bad
// deduction is flagged and a normal one is not. Day boundaries come from the tenant's timezone.
//
// Other suites write to the demo tenant all the time, so exact figures use a tenant of their
// own: the demo seed definition under another slug, built at a fixed "now" (read-only routes
// work on a non-demo tenant). NOW is 00:30 in Cairo (UTC+2 in November), so orders from the
// last half hour sit on 6 November locally but on 5 November in UTC.

const SLUG = 'report-check';
const NOW = new Date('2026-11-05T22:30:00Z');
const CAIRO_OFFSET_MS = 2 * 3_600_000;
const D = (v: string | number) => new Prisma.Decimal(v);
const ADMIN = { 'x-dev-role': 'ADMIN' };
const MANAGER = { 'x-dev-role': 'MANAGER' };

/** Cairo calendar date of an instant, computed independently of the code under test. */
const cairoDate = (at: Date) => new Date(at.getTime() + CAIRO_OFFSET_MS).toISOString().slice(0, 10);

interface Figures {
  date: string;
  revenue: string;
  orderCount: number;
  wasteCost: string;
  uncostedWasteRows: number;
}

/** Expected figures per Cairo day, straight from the seed rows. */
function expectedFromSeed(seed: TenantSeed): Map<string, Figures> {
  const deductKeys = new Set(seed.stages.filter((s) => s.deductsInventory).map((s) => s.key));
  const days = new Map<
    string,
    { revenue: Prisma.Decimal; orders: number; waste: Prisma.Decimal; uncosted: number }
  >();
  const day = (date: string) => {
    if (!days.has(date)) days.set(date, { revenue: D('0'), orders: 0, waste: D('0'), uncosted: 0 });
    return days.get(date)!;
  };
  for (const o of seed.orders) {
    if (o.canceledAt) continue;
    day(cairoDate(o.createdAt as Date)).orders += 1;
    const delivered = seed.history.find((h) => h.orderId === o.id && deductKeys.has(h.toStageKey!));
    if (delivered) {
      const d = day(cairoDate(delivered.createdAt as Date));
      d.revenue = d.revenue.plus(D(o.total as string));
    }
  }
  for (const row of [...seed.ledgerBeforeSnapshot, ...seed.ledgerAfterSnapshot]) {
    if (row.type !== 'WASTE') continue;
    const d = day(cairoDate(row.createdAt as Date));
    if (row.unitCost === null || row.unitCost === undefined) d.uncosted += 1;
    else
      d.waste = d.waste.plus(
        D((row.quantityDelta as Prisma.Decimal | string).toString())
          .negated()
          .times(D((row.unitCost as Prisma.Decimal | string).toString())),
      );
  }
  return new Map(
    [...days].map(([date, d]) => [
      date,
      {
        date,
        revenue: d.revenue.toFixed(2),
        orderCount: d.orders,
        wasteCost: d.waste.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
        uncostedWasteRows: d.uncosted,
      },
    ]),
  );
}

/** RAW/READY active items now negative, at zero or below their threshold (the B702 rule). */
function expectedLowStock(seed: TenantSeed): number {
  return seed.inventoryItems.filter((item) => {
    if (item.type === 'MIXED' || item.isActive === false) return false;
    const row = seed.branchStock.find((s) => s.inventoryItemId === item.id);
    const stock = D((row?.currentStock as Prisma.Decimal | string | undefined)?.toString() ?? '0');
    const threshold =
      row?.lowStockThreshold == null
        ? null
        : D((row.lowStockThreshold as Prisma.Decimal | string).toString());
    return (
      !stock.isPositive() || stock.isZero() || (threshold !== null && stock.lessThan(threshold))
    );
  }).length;
}

describe('reports (B1101)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let seed: TenantSeed;
  let expected: Map<string, Figures>;
  const http = () => request(app.getHttpServer());
  const zero = (date: string): Figures => ({
    date,
    revenue: '0.00',
    orderCount: 0,
    wasteCost: '0.00',
    uncostedWasteRows: 0,
  });

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = buildTenantSeed(
      { ...DEMO_TENANT, slug: SLUG, name: 'Report Check', isDemo: false },
      NOW,
    );
    await prisma.$transaction((tx) => writeTenantSeed(tx, seed), { timeout: 60_000 });
    expected = expectedFromSeed(seed);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testConfig())],
    }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('KPIs and aggregates match the seed exactly', () => {
    it('has seed activity on more than one local day (so the check means something)', () => {
      expect(expected.size).toBeGreaterThanOrEqual(2);
      expect([...expected.values()].some((d) => d.revenue !== '0.00')).toBe(true);
      expect([...expected.values()].some((d) => d.wasteCost !== '0.00')).toBe(true);
      expect(expectedLowStock(seed)).toBeGreaterThan(0);
    });

    it('returns the dashboard KPIs for each seeded day', async () => {
      for (const [date, figures] of expected) {
        const res = await http()
          .get(`/v1/${SLUG}/reports/kpis?date=${date}`)
          .set(MANAGER)
          .expect(200);
        expect(bodyOf(res)).toEqual({
          ...figures,
          timezone: 'Africa/Cairo',
          branchId: seed.branches[0]!.id,
          lowStockCount: expectedLowStock(seed),
        });
      }
    });

    it('returns one row per local day, with totals, for a date range', async () => {
      const dates = [...expected.keys()].sort();
      const from = dates[0]!;
      const to = '2026-11-07';
      const res = await http()
        .get(`/v1/${SLUG}/reports/daily?from=${from}&to=${to}`)
        .set(ADMIN)
        .expect(200);
      const body = bodyOf(res) as { days: Figures[]; totals: Figures };
      expect(body.days.map((d) => d.date)).toEqual(
        [...new Set([...dates, '2026-11-06', '2026-11-07'])].sort(),
      );
      for (const d of body.days) expect(d).toEqual(expected.get(d.date) ?? zero(d.date));
      const sum = (f: (x: Figures) => string) =>
        [...expected.values()].reduce((s, x) => s.plus(D(f(x))), D('0')).toFixed(2);
      expect(body.totals).toEqual({
        date: from,
        revenue: sum((x) => x.revenue),
        orderCount: [...expected.values()].reduce((n, x) => n + x.orderCount, 0),
        wasteCost: sum((x) => x.wasteCost),
        uncostedWasteRows: [...expected.values()].reduce((n, x) => n + x.uncostedWasteRows, 0),
      });
    });

    it('cuts days at local midnight, not UTC midnight', async () => {
      const lateOrders = seed.orders.filter(
        (o) => !o.canceledAt && (o.createdAt as Date) >= new Date('2026-11-05T22:00:00Z'),
      );
      expect(lateOrders.length).toBeGreaterThan(0); // placed after 00:00 Cairo, before 00:00 UTC
      const res = await http()
        .get(`/v1/${SLUG}/reports/kpis?date=2026-11-06`)
        .set(MANAGER)
        .expect(200);
      expect((bodyOf(res) as Figures).orderCount).toBe(lateOrders.length);
    });
  });

  describe('anomalies: deduction versus recipe expectation', () => {
    const tenantId = () => seed.tenant.id;
    const branchId = () => seed.branches[0]!.id;
    const fries = () => seedId(SLUG, 'menu_items', 'fries');
    const potatoes = () => seedId(SLUG, 'inventory_items', 'potatoes');
    const oil = () => seedId(SLUG, 'inventory_items', 'cooking-oil');
    const deliveredStage = () => seed.stages.find((s) => s.deductsInventory)!.key;

    /** A delivered order of `qty` fries on 8 Nov (Cairo), with the given CONSUMPTION rows. */
    async function deliveredFries(at: string, qty: number, deducted: [string, string][]) {
      const orderId = randomUUID();
      const managerId = seed.users.find((u) => u.role === 'MANAGER')!.id;
      await prisma.order.create({
        data: {
          id: orderId,
          tenantId: tenantId(),
          branchId: branchId(),
          stageKey: deliveredStage(),
          placedByType: 'STAFF',
          placedById: managerId,
          total: D('55').times(qty),
          createdAt: new Date(at),
        },
      });
      await prisma.orderItem.create({
        data: {
          tenantId: tenantId(),
          orderId,
          menuItemId: fries(),
          name: 'Hand-cut Fries',
          unitPrice: '55.00',
          quantity: qty,
          lineTotal: D('55').times(qty),
        },
      });
      await prisma.orderStageHistory.createMany({
        data: [
          {
            tenantId: tenantId(),
            orderId,
            action: 'PLACED',
            toStageKey: seed.stages[0]!.key,
            actorId: managerId,
            createdAt: new Date(at),
          },
          {
            tenantId: tenantId(),
            orderId,
            action: 'ADVANCED',
            fromStageKey: seed.stages[0]!.key,
            toStageKey: deliveredStage(),
            actorId: managerId,
            createdAt: new Date(new Date(at).getTime() + 60_000),
          },
        ],
      });
      for (const [itemId, quantity] of deducted) {
        await prisma.inventoryTransaction.create({
          data: {
            tenantId: tenantId(),
            branchId: branchId(),
            inventoryItemId: itemId,
            type: 'CONSUMPTION',
            quantityDelta: D(quantity).negated(),
            relatedOrderId: orderId,
            actorId: managerId,
            createdAt: new Date(new Date(at).getTime() + 60_000),
          },
        });
      }
      return orderId;
    }

    it('flags nothing in the seeded history (every seeded deduction follows its recipe)', async () => {
      const res = await http()
        .get(`/v1/${SLUG}/reports/anomalies?from=2026-11-01&to=2026-11-07`)
        .set(MANAGER)
        .expect(200);
      const body = bodyOf(res) as {
        checkedOrders: number;
        anomalies: unknown[];
        unchecked: unknown[];
      };
      expect(body.checkedOrders).toBeGreaterThan(0);
      expect(body.anomalies).toEqual([]);
      expect(body.unchecked).toEqual([]);
    });

    it('flags a constructed bad deduction and not a normal one, with a readable reason', async () => {
      // 2 fries = 0.500 KG potatoes + 0.040 L oil.
      const normal = await deliveredFries('2026-11-08T08:00:00Z', 2, [
        [potatoes(), '0.500'],
        [oil(), '0.040'],
      ]);
      const bad = await deliveredFries('2026-11-08T09:00:00Z', 2, [
        [potatoes(), '1.500'],
        [oil(), '0.040'],
      ]);
      const res = await http()
        .get(`/v1/${SLUG}/reports/anomalies?from=2026-11-08&to=2026-11-08`)
        .set(MANAGER)
        .expect(200);
      const body = bodyOf(res) as {
        checkedOrders: number;
        anomalies: { orderId: string; inventoryItemId: string; kind: string; reason: string }[];
      };
      expect(body.checkedOrders).toBe(2);
      expect(body.anomalies).toEqual([
        expect.objectContaining({
          orderId: bad,
          inventoryItemId: potatoes(),
          itemName: 'Potatoes',
          kind: 'OVER_DEDUCTED',
          expectedQuantity: '0.500',
          actualQuantity: '1.500',
          unit: 'KG',
          reason: 'Potatoes: deducted 3× the recipe expectation (1.500 KG instead of 0.500 KG).',
        }),
      ]);
      expect(body.anomalies.map((a) => a.orderId)).not.toContain(normal);
    });

    it('flags a delivered order that deducted nothing', async () => {
      const missing = await deliveredFries('2026-11-09T08:00:00Z', 1, []);
      const res = await http()
        .get(`/v1/${SLUG}/reports/anomalies?from=2026-11-09&to=2026-11-09`)
        .set(MANAGER)
        .expect(200);
      const body = bodyOf(res) as { anomalies: { orderId: string; kind: string }[] };
      expect(body.anomalies.map((a) => [a.orderId, a.kind])).toEqual([
        [missing, 'NOT_DEDUCTED'],
        [missing, 'NOT_DEDUCTED'],
      ]);
    });

    it('counts an order once when it reaches a second deducting stage on a later day', async () => {
      // ADR 0022 allows a later stage that also deducts (this tenant gets one, last in order).
      const lastPosition = Math.max(...seed.stages.map((s) => s.position));
      await prisma.orderWorkflowStage.create({
        data: {
          tenantId: tenantId(),
          key: 'settled',
          label: 'Settled',
          position: lastPosition + 1,
          cancellable: false,
          deductsInventory: true,
        },
      });
      const order = await deliveredFries('2026-11-11T08:00:00Z', 2, [
        [potatoes(), '0.500'],
        [oil(), '0.040'],
      ]);
      await prisma.orderStageHistory.create({
        data: {
          tenantId: tenantId(),
          orderId: order,
          action: 'ADVANCED',
          fromStageKey: deliveredStage(),
          toStageKey: 'settled',
          createdAt: new Date('2026-11-12T08:00:00Z'),
        },
      });
      const daily = await http()
        .get(`/v1/${SLUG}/reports/daily?from=2026-11-11&to=2026-11-12`)
        .set(MANAGER)
        .expect(200);
      const body = bodyOf(daily) as { days: Figures[]; totals: Figures };
      expect(body.days.map((d) => [d.date, d.revenue])).toEqual([
        ['2026-11-11', '110.00'],
        ['2026-11-12', '0.00'],
      ]);
      expect(body.totals.revenue).toBe('110.00');
      const second = await http()
        .get(`/v1/${SLUG}/reports/anomalies?from=2026-11-12&to=2026-11-12`)
        .set(MANAGER)
        .expect(200);
      expect(bodyOf(second)).toMatchObject({ checkedOrders: 0, anomalies: [], unchecked: [] });
      const first = await http()
        .get(`/v1/${SLUG}/reports/anomalies?from=2026-11-11&to=2026-11-12`)
        .set(MANAGER)
        .expect(200);
      expect(bodyOf(first)).toMatchObject({ checkedOrders: 1, anomalies: [] });
    });

    it('does not judge an order whose recipe changed after delivery', async () => {
      const order = await deliveredFries('2026-11-10T08:00:00Z', 1, [[potatoes(), '0.900']]);
      const anomaliesOn10th = async () =>
        bodyOf(
          await http()
            .get(`/v1/${SLUG}/reports/anomalies?from=2026-11-10&to=2026-11-10`)
            .set(MANAGER)
            .expect(200),
        ) as {
          checkedOrders: number;
          anomalies: { orderId: string }[];
          unchecked: { orderId: string; reason: string }[];
        };
      // A price or name edit of the menu item alone does not hide the order: it is judged.
      await prisma.menuItem.update({
        where: { id: fries() },
        data: { updatedAt: new Date('2026-11-10T12:00:00Z') },
      });
      const judged = await anomaliesOn10th();
      expect(judged.checkedOrders).toBe(1);
      expect(judged.anomalies.map((a) => a.orderId)).toContain(order);
      // A recipe edit replaces the lines (ADR 0019): new line times mark it.
      await prisma.menuItemIngredient.updateMany({
        where: { menuItemId: fries() },
        data: { createdAt: new Date('2026-11-10T12:00:00Z') },
      });
      const body = await anomaliesOn10th();
      expect(body).toMatchObject({ checkedOrders: 0, anomalies: [] });
      expect(body.unchecked).toEqual([
        expect.objectContaining({
          orderId: order,
          reason: expect.stringContaining('changed after delivery') as unknown,
        }),
      ]);
    });
  });

  describe('access and input', () => {
    it('is for managers and admins', async () => {
      const res = await http()
        .get(`/v1/${SLUG}/reports/kpis`)
        .set({ 'x-dev-role': 'WORKER' })
        .expect(403);
      expect(bodyOf(res)).toMatchObject({ code: 'ROLE_FORBIDDEN' });
      await http().get(`/v1/${SLUG}/reports/kpis`).expect(401);
    });

    it('defaults the KPI day to today in the tenant timezone', async () => {
      const res = await http().get(`/v1/${SLUG}/reports/kpis`).set(MANAGER).expect(200);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(
        new Date(),
      );
      expect((bodyOf(res) as Figures).date).toBe(today);
    });

    it.each([
      ['a malformed date', '/reports/kpis?date=2026-13-01', 'VALIDATION_FAILED'],
      ['a missing range end', '/reports/daily?from=2026-11-01', 'VALIDATION_FAILED'],
      [
        'a range that ends before it starts',
        '/reports/daily?from=2026-11-07&to=2026-11-01',
        'INVALID_DATE_RANGE',
      ],
      [
        'a range over 366 days',
        '/reports/anomalies?from=2025-01-01&to=2026-11-07',
        'INVALID_DATE_RANGE',
      ],
      ['a date that does not exist', '/reports/kpis?date=2026-02-30', 'INVALID_DATE_RANGE'],
    ])('rejects %s', async (_name, path, code) => {
      const res = await http().get(`/v1/${SLUG}${path}`).set(MANAGER).expect(400);
      expect(bodyOf(res)).toMatchObject({ code });
    });
  });
});
