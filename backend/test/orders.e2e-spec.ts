import { createHash, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { bodyOf } from './http';
import { ensureSeedTenants, unscopedClient, type SeedTenants } from './seed-tenants';
import { testConfig } from './test-config';

// B801 acceptance on real Postgres:
// - delivering twice deducts once (also two deliveries at the same moment);
// - cancelling after the cancellable stage is rejected;
// - changing the stage config changes behavior with no code change (a second, custom tenant).
// Plus: default stages per tenant, placing orders (copied prices, guest token), stage history.
// Fixtures use their own inventory items (no low-stock threshold), so seed checks still hold.

const SLUG = 'nile-bites';
const run = Date.now().toString(36);
const FLOW_SLUG = `flow-lab-${run}`;
const D = (v: string) => new Prisma.Decimal(v);

type Json = Record<string, unknown>;
interface OrderBody {
  id: string;
  branchId: string;
  stageKey: string;
  status: string;
  canceledAt: string | null;
  placedBy: { actorType: string; actorId: string | null };
  total: string;
  note: string | null;
  items: {
    menuItemId: string;
    name: string;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
  }[];
  trackingToken?: string | null;
}

describe('orders and workflow (B801)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let seed: SeedTenants;
  let tenantId: string;
  let branchId: string;
  let workerId: string;
  let bowl: string;
  let archived: string;
  let rice: string;
  const logs: string[] = [];
  const http = () => request(app.getHttpServer());
  const as = (role: string) => ({ 'x-dev-role': role });

  // The custom-workflow tenant (acceptance 3).
  const flow = {
    tenantId: randomUUID(),
    branch1: randomUUID(),
    branch2: randomUUID(),
    worker1: randomUUID(),
    worker2: randomUUID(),
    admin: randomUUID(),
    stew: randomUUID(),
    branch2Only: randomUUID(),
    beans: randomUUID(),
  };

  const stockOf = async (t: string, b: string, item: string): Promise<string> => {
    const row = await prisma.branchStock.findUnique({
      where: {
        tenantId_branchId_inventoryItemId: { tenantId: t, branchId: b, inventoryItemId: item },
      },
    });
    return (row?.currentStock ?? D('0')).toFixed(3);
  };
  const consumption = (orderId: string) =>
    prisma.inventoryTransaction.findMany({
      where: { relatedOrderId: orderId, type: 'CONSUMPTION' },
      select: { inventoryItemId: true, quantityDelta: true, actorId: true },
    });
  const history = (orderId: string) =>
    prisma.orderStageHistory.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { action: 'asc' }],
      select: { action: true, fromStageKey: true, toStageKey: true, actorId: true },
    });

  async function place(
    body: Json,
    headers: Record<string, string> = as('WORKER'),
    slug = SLUG,
  ): Promise<OrderBody> {
    const res = await http().post(`/v1/${slug}/orders`).set(headers).send(body).expect(201);
    return bodyOf(res) as OrderBody;
  }
  const placeBowl = (headers?: Record<string, string>) =>
    place({ items: [{ menuItemId: bowl, quantity: 2 }] }, headers);
  const advance = (id: string, headers: Record<string, string> = as('WORKER'), slug = SLUG) =>
    http().post(`/v1/${slug}/orders/${id}/advance`).set(headers);
  const cancel = (id: string, headers: Record<string, string> = as('WORKER'), slug = SLUG) =>
    http().post(`/v1/${slug}/orders/${id}/cancel`).set(headers);
  const codeOf = (res: { body: unknown }) => (bodyOf(res) as { code?: string }).code;

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = await ensureSeedTenants(prisma);
    tenantId = seed.a.tenant.id;
    branchId = seed.a.branches[0]!.id;
    workerId = seed.a.users.find((u) => u.role === 'WORKER' && u.isDemo)!.id;
    const categoryId = seed.a.categories[0]!.id;

    // Tenant A fixture: one RAW item with 10 KG backed by a purchase, a bowl using 200 G of it.
    rice = randomUUID();
    bowl = randomUUID();
    archived = randomUUID();
    await prisma.inventoryItem.create({
      data: { id: rice, tenantId, name: `Orders Rice ${run}`, type: 'RAW', unit: 'KG' },
    });
    await prisma.inventoryTransaction.create({
      data: {
        tenantId,
        branchId,
        inventoryItemId: rice,
        type: 'PURCHASE',
        quantityDelta: '10',
        unitCost: '30.0000',
        actorId: workerId,
      },
    });
    await prisma.branchStock.create({
      data: { tenantId, branchId, inventoryItemId: rice, currentStock: '10', avgUnitCost: '30' },
    });
    await prisma.menuItem.createMany({
      data: [
        { id: bowl, tenantId, categoryId, name: `Orders Bowl ${run}`, price: '42.50' },
        {
          id: archived,
          tenantId,
          categoryId,
          name: `Orders Old Bowl ${run}`,
          price: '1.00',
          status: 'ARCHIVED',
        },
      ],
    });
    await prisma.menuItemIngredient.create({
      data: { tenantId, menuItemId: bowl, inventoryItemId: rice, quantity: '200', unit: 'G' },
    });

    // Custom tenant: two branches, renamed stages stored out of order with gaps in positions.
    // Two cancellable stages, a deducting stage in the middle and another one later.
    const f = flow;
    await prisma.tenant.create({
      data: { id: f.tenantId, slug: FLOW_SLUG, name: 'Flow Lab', timezone: 'UTC', isDemo: true },
    });
    await prisma.branch.createMany({
      data: [
        { id: f.branch1, tenantId: f.tenantId, name: 'Uptown' },
        { id: f.branch2, tenantId: f.tenantId, name: 'Downtown' },
      ],
    });
    await prisma.user.createMany({
      data: [
        { id: f.admin, tenantId: f.tenantId, name: 'Flow Admin', role: 'ADMIN', isDemo: true },
        {
          id: f.worker1,
          tenantId: f.tenantId,
          branchId: f.branch1,
          name: 'Flow Worker',
          role: 'WORKER',
          isDemo: true,
        },
        {
          id: f.worker2,
          tenantId: f.tenantId,
          branchId: f.branch2,
          name: 'Downtown Worker',
          role: 'WORKER',
        },
      ],
    });
    await prisma.orderWorkflowStage.createMany({
      data: [
        { key: 'boxed', label: 'Boxed', position: 40, cancellable: false, deductsInventory: false },
        { key: 'new', label: 'New', position: 10, cancellable: true, deductsInventory: false },
        {
          key: 'handed-over',
          label: 'Handed over',
          position: 50,
          cancellable: false,
          deductsInventory: true,
        },
        {
          key: 'plated',
          label: 'Plated',
          position: 30,
          cancellable: false,
          deductsInventory: true,
        },
        {
          key: 'firing',
          label: 'Firing',
          position: 20,
          cancellable: true,
          deductsInventory: false,
        },
      ].map((s) => ({ ...s, tenantId: f.tenantId })),
    });
    const flowCategory = randomUUID();
    await prisma.category.create({
      data: { id: flowCategory, tenantId: f.tenantId, name: 'Stews' },
    });
    await prisma.inventoryItem.create({
      data: { id: f.beans, tenantId: f.tenantId, name: 'Beans', type: 'RAW', unit: 'KG' },
    });
    await prisma.menuItem.createMany({
      data: [
        { id: f.stew, tenantId: f.tenantId, categoryId: flowCategory, name: 'Stew', price: '20' },
        {
          id: f.branch2Only,
          tenantId: f.tenantId,
          categoryId: flowCategory,
          branchId: f.branch2,
          name: 'Downtown Special',
          price: '30',
        },
      ],
    });
    await prisma.menuItemIngredient.create({
      data: {
        tenantId: f.tenantId,
        menuItemId: f.stew,
        inventoryItemId: f.beans,
        quantity: '0.3',
        unit: 'KG',
      },
    });

    const logStream = new Writable({
      write(chunk: Buffer, _encoding, done): void {
        logs.push(chunk.toString());
        done();
      },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testConfig({ logLevel: 'info' }), { logStream })],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<INestApplication<App>>({ bufferLogs: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('workflow stages', () => {
    it('every seeded tenant has the four default stages, read in position order', async () => {
      for (const slug of [SLUG, 'harbor-grill']) {
        const res = await http().get(`/v1/${slug}/workflow`).expect(200);
        expect(bodyOf(res)).toEqual({
          stages: [
            {
              key: 'pending',
              label: 'Pending',
              position: 1,
              cancellable: true,
              deductsInventory: false,
            },
            {
              key: 'in-preparation',
              label: 'In Preparation',
              position: 2,
              cancellable: false,
              deductsInventory: false,
            },
            {
              key: 'ready',
              label: 'Ready',
              position: 3,
              cancellable: false,
              deductsInventory: false,
            },
            {
              key: 'delivered',
              label: 'Delivered',
              position: 4,
              cancellable: false,
              deductsInventory: true,
            },
          ],
        });
      }
    });

    it('returns a custom config sorted by position', async () => {
      const res = await http().get(`/v1/${FLOW_SLUG}/workflow`).expect(200);
      const stages = (bodyOf(res) as { stages: { key: string }[] }).stages;
      expect(stages.map((s) => s.key)).toEqual(['new', 'firing', 'plated', 'boxed', 'handed-over']);
    });
  });

  describe('placing an order', () => {
    it('a guest order is GUEST, starts at the first stage and returns its tracking token once', async () => {
      const order = await place(
        { items: [{ menuItemId: bowl, quantity: 3 }], note: '  no onions  ' },
        {},
      );
      expect(order).toMatchObject({
        branchId,
        stageKey: 'pending',
        status: 'pending',
        canceledAt: null,
        placedBy: { actorType: 'GUEST', actorId: null },
        total: '127.50',
        note: 'no onions',
        items: [
          {
            menuItemId: bowl,
            name: `Orders Bowl ${run}`,
            unitPrice: '42.50',
            quantity: 3,
            lineTotal: '127.50',
          },
        ],
      });
      expect(order.trackingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.trackingTokenHash).toBe(
        createHash('sha256').update(order.trackingToken!).digest('hex'),
      );
      expect(JSON.stringify(row)).not.toContain(order.trackingToken);
      expect(await history(order.id)).toEqual([
        { action: 'PLACED', fromStageKey: null, toStageKey: 'pending', actorId: null },
      ]);
      // Nothing is deducted on placing.
      expect(await consumption(order.id)).toEqual([]);
    });

    it('a staff order is STAFF with the actor, and has no tracking token', async () => {
      const order = await placeBowl();
      expect(order.placedBy).toEqual({ actorType: 'STAFF', actorId: workerId });
      expect(order.trackingToken).toBeNull();
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row).toMatchObject({
        placedByType: 'STAFF',
        placedById: workerId,
        trackingTokenHash: null,
      });
      expect(await history(order.id)).toEqual([
        { action: 'PLACED', fromStageKey: null, toStageKey: 'pending', actorId: workerId },
      ]);
    });

    it('keeps the name and price of the moment it was placed', async () => {
      const order = await placeBowl();
      await prisma.menuItem.update({ where: { id: bowl }, data: { price: '99.99' } });
      try {
        const line = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
        expect(line.unitPrice.toFixed(2)).toBe('42.50');
        expect(line.lineTotal.toFixed(2)).toBe('85.00');
      } finally {
        await prisma.menuItem.update({ where: { id: bowl }, data: { price: '42.50' } });
      }
    });

    it('refuses archived, unknown and other-branch items, listing them', async () => {
      const unknown = randomUUID();
      const res = await http()
        .post(`/v1/${SLUG}/orders`)
        .send({
          items: [
            { menuItemId: bowl, quantity: 1 },
            { menuItemId: archived, quantity: 1 },
            { menuItemId: unknown, quantity: 1 },
          ],
        })
        .expect(400);
      expect(bodyOf(res)).toMatchObject({
        code: 'MENU_ITEM_UNAVAILABLE',
        details: { menuItemIds: expect.arrayContaining([archived, unknown]) as unknown },
      });
      const other = await http()
        .post(`/v1/${FLOW_SLUG}/orders`)
        .set(as('WORKER'))
        .send({ items: [{ menuItemId: flow.branch2Only, quantity: 1 }] })
        .expect(400);
      expect(bodyOf(other)).toMatchObject({
        code: 'MENU_ITEM_UNAVAILABLE',
        details: { menuItemIds: [flow.branch2Only] },
      });
    });

    it('validates the body', async () => {
      for (const body of [
        {},
        { items: [] },
        { items: [{ menuItemId: bowl, quantity: 0 }] },
        { items: [{ menuItemId: bowl, quantity: 1.5 }] },
        { items: [{ menuItemId: 'not-a-uuid', quantity: 1 }] },
        { items: [{ menuItemId: bowl, quantity: 1, unitPrice: '0.01' }] },
        { items: [{ menuItemId: bowl, quantity: 1 }], total: '0.01' },
      ]) {
        const res = await http().post(`/v1/${SLUG}/orders`).send(body).expect(400);
        expect(codeOf(res)).toBe('VALIDATION_FAILED');
      }
    });

    it('needs a branch: a guest of a multi-branch restaurant is refused', async () => {
      const res = await http()
        .post(`/v1/${FLOW_SLUG}/orders`)
        .send({ items: [{ menuItemId: flow.stew, quantity: 1 }] })
        .expect(400);
      expect(codeOf(res)).toBe('BRANCH_REQUIRED');
    });
  });

  describe('advancing (acceptance: delivering twice deducts once)', () => {
    it('walks the stages by position, deducts on the deducts_inventory stage, records history', async () => {
      const order = await placeBowl();
      const before = await stockOf(tenantId, branchId, rice);
      const keys: string[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await advance(order.id).expect(200);
        keys.push((bodyOf(res) as OrderBody).stageKey);
        if (i < 2) expect(await consumption(order.id)).toEqual([]);
      }
      expect(keys).toEqual(['in-preparation', 'ready', 'delivered']);
      const rows = await consumption(order.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ inventoryItemId: rice, actorId: workerId });
      expect(rows[0]!.quantityDelta.toFixed(3)).toBe('-0.400');
      expect(await stockOf(tenantId, branchId, rice)).toBe(D(before).minus('0.4').toFixed(3));

      // Delivering again: there is no next stage, nothing more is deducted.
      const again = await advance(order.id).expect(409);
      expect(codeOf(again)).toBe('ORDER_AT_LAST_STAGE');
      expect(await consumption(order.id)).toHaveLength(1);
      expect(await stockOf(tenantId, branchId, rice)).toBe(D(before).minus('0.4').toFixed(3));

      expect(await history(order.id)).toEqual([
        { action: 'PLACED', fromStageKey: null, toStageKey: 'pending', actorId: workerId },
        {
          action: 'ADVANCED',
          fromStageKey: 'pending',
          toStageKey: 'in-preparation',
          actorId: workerId,
        },
        {
          action: 'ADVANCED',
          fromStageKey: 'in-preparation',
          toStageKey: 'ready',
          actorId: workerId,
        },
        { action: 'ADVANCED', fromStageKey: 'ready', toStageKey: 'delivered', actorId: workerId },
      ]);
    });

    it('two deliveries at the same moment: one wins, stock is deducted once', async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const order = await placeBowl();
        await advance(order.id).expect(200);
        await advance(order.id).expect(200);
        const before = await stockOf(tenantId, branchId, rice);
        const results = await Promise.all([advance(order.id), advance(order.id, as('MANAGER'))]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        const loser = results.find((r) => r.status === 409)!;
        expect(['ORDER_STAGE_CHANGED', 'ORDER_AT_LAST_STAGE']).toContain(codeOf(loser));
        expect(await consumption(order.id)).toHaveLength(1);
        expect(await stockOf(tenantId, branchId, rice)).toBe(D(before).minus('0.4').toFixed(3));
        const advanced = (await history(order.id)).filter((h) => h.toStageKey === 'delivered');
        expect(advanced).toHaveLength(1);
      }
    });

    it('is staff-only', async () => {
      const order = await placeBowl();
      const res = await advance(order.id, {}).expect(401);
      expect(codeOf(res)).toBe('AUTH_REQUIRED');
    });

    it('404s for an unknown order', async () => {
      const res = await advance(randomUUID()).expect(404);
      expect(codeOf(res)).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('cancelling (acceptance: after the cancellable stage is rejected)', () => {
    it('cancels while cancellable, with no inventory change, and the order stops there', async () => {
      const order = await placeBowl();
      const before = await stockOf(tenantId, branchId, rice);
      const res = await cancel(order.id).expect(200);
      expect(bodyOf(res)).toMatchObject({
        stageKey: 'pending',
        status: 'cancelled',
        canceledAt: expect.any(String) as unknown,
      });
      expect(await stockOf(tenantId, branchId, rice)).toBe(before);
      expect(await prisma.inventoryTransaction.count({ where: { relatedOrderId: order.id } })).toBe(
        0,
      );
      expect(codeOf(await advance(order.id).expect(409))).toBe('ORDER_CANCELED');
      expect(codeOf(await cancel(order.id).expect(409))).toBe('ORDER_CANCELED');
      expect((await history(order.id)).at(-1)).toEqual({
        action: 'CANCELED',
        fromStageKey: 'pending',
        toStageKey: null,
        actorId: workerId,
      });
    });

    it('rejects a cancel once the order left the cancellable stage, and changes nothing', async () => {
      const order = await placeBowl();
      await advance(order.id).expect(200);
      const res = await cancel(order.id).expect(409);
      expect(bodyOf(res)).toMatchObject({
        code: 'ORDER_NOT_CANCELLABLE',
        details: { orderId: order.id, stageKey: 'in-preparation' },
      });
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row).toMatchObject({ stageKey: 'in-preparation', canceledAt: null });
      expect((await history(order.id)).map((h) => h.action)).toEqual(['PLACED', 'ADVANCED']);
    });

    it('a cancel racing an advance: exactly one of them happens', async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const order = await placeBowl();
        const [a, c] = await Promise.all([advance(order.id), cancel(order.id)]);
        expect([a.status, c.status].sort()).toEqual([200, 409]);
        const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
        if (a.status === 200)
          expect(row).toMatchObject({ stageKey: 'in-preparation', canceledAt: null });
        else
          expect(row).toMatchObject({
            stageKey: 'pending',
            canceledAt: expect.any(Date) as unknown,
          });
        expect(await history(order.id)).toHaveLength(2);
      }
    });

    describe('a guest, with the tracking token (ADR 0008)', () => {
      it('cancels their own order while it is cancellable; the actor is NULL', async () => {
        const order = await place({ items: [{ menuItemId: bowl, quantity: 1 }] }, {});
        const res = await http()
          .post(`/v1/${SLUG}/track/${order.trackingToken!}/cancel`)
          .expect(200);
        expect(bodyOf(res)).toMatchObject({ id: order.id, status: 'cancelled' });
        expect((await history(order.id)).at(-1)).toEqual({
          action: 'CANCELED',
          fromStageKey: 'pending',
          toStageKey: null,
          actorId: null,
        });
        // The token never reaches the logs.
        expect(logs.join('')).toContain('/track/[REDACTED]/cancel');
        expect(logs.join('')).not.toContain(order.trackingToken!);
      });

      it('is rejected once the order left the cancellable stage', async () => {
        const order = await place({ items: [{ menuItemId: bowl, quantity: 1 }] }, {});
        await advance(order.id).expect(200);
        const res = await http()
          .post(`/v1/${SLUG}/track/${order.trackingToken!}/cancel`)
          .expect(409);
        expect(codeOf(res)).toBe('ORDER_NOT_CANCELLABLE');
      });

      it('404s for an unknown token, and a guest cannot cancel by order id', async () => {
        const unknown = await http()
          .post(`/v1/${SLUG}/track/${'x'.repeat(43)}/cancel`)
          .expect(404);
        expect(codeOf(unknown)).toBe('ORDER_NOT_FOUND');
        const order = await place({ items: [{ menuItemId: bowl, quantity: 1 }] }, {});
        expect(codeOf(await cancel(order.id, {}).expect(401))).toBe('AUTH_REQUIRED');
        // Another tenant's path does not find it either.
        await http().post(`/v1/harbor-grill/track/${order.trackingToken!}/cancel`).expect(403);
      });
    });
  });

  describe('acceptance: the stage config drives behavior (no code change)', () => {
    const W = { 'x-dev-role': 'WORKER' };
    const placeStew = async () => {
      const res = await http()
        .post(`/v1/${FLOW_SLUG}/orders`)
        .set(W)
        .send({ items: [{ menuItemId: flow.stew, quantity: 2 }] })
        .expect(201);
      return bodyOf(res) as OrderBody;
    };

    it('starts at the lowest position, deducts at the flagged middle stage, once', async () => {
      const order = await placeStew();
      expect(order).toMatchObject({ stageKey: 'new', branchId: flow.branch1 });
      const seen: string[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await advance(order.id, W, FLOW_SLUG).expect(200);
        seen.push((bodyOf(res) as OrderBody).stageKey);
        const rows = await consumption(order.id);
        // Nothing before `plated` (position 30); exactly one row from there on.
        expect(rows).toHaveLength(i >= 1 ? 1 : 0);
      }
      expect(seen).toEqual(['firing', 'plated', 'boxed', 'handed-over']);
      // `handed-over` deducts too: the ledger saw the order was already deducted.
      expect((await consumption(order.id))[0]!.quantityDelta.toFixed(3)).toBe('-0.600');
      expect(await stockOf(flow.tenantId, flow.branch1, flow.beans)).toBe('-0.600');
      expect(codeOf(await advance(order.id, W, FLOW_SLUG).expect(409))).toBe('ORDER_AT_LAST_STAGE');
    });

    it('cancels on every cancellable stage and nowhere else', async () => {
      const atNew = await placeStew();
      await cancel(atNew.id, W, FLOW_SLUG).expect(200);

      const atFiring = await placeStew();
      await advance(atFiring.id, W, FLOW_SLUG).expect(200);
      await cancel(atFiring.id, W, FLOW_SLUG).expect(200);

      const atPlated = await placeStew();
      await advance(atPlated.id, W, FLOW_SLUG).expect(200);
      await advance(atPlated.id, W, FLOW_SLUG).expect(200);
      expect(codeOf(await cancel(atPlated.id, W, FLOW_SLUG).expect(409))).toBe(
        'ORDER_NOT_CANCELLABLE',
      );
    });

    it('flipping a flag in the database changes the outcome', async () => {
      const order = await placeStew();
      await prisma.orderWorkflowStage.update({
        where: { tenantId_key: { tenantId: flow.tenantId, key: 'new' } },
        data: { cancellable: false },
      });
      try {
        expect(codeOf(await cancel(order.id, W, FLOW_SLUG).expect(409))).toBe(
          'ORDER_NOT_CANCELLABLE',
        );
      } finally {
        await prisma.orderWorkflowStage.update({
          where: { tenantId_key: { tenantId: flow.tenantId, key: 'new' } },
          data: { cancellable: true },
        });
      }
      await cancel(order.id, W, FLOW_SLUG).expect(200);
    });

    it("staff act only on their branch's orders; an ADMIN on any branch", async () => {
      const order = await placeStew();
      const other = { 'x-dev-user': flow.worker2 };
      expect(codeOf(await advance(order.id, other, FLOW_SLUG).expect(404))).toBe('ORDER_NOT_FOUND');
      expect(codeOf(await cancel(order.id, other, FLOW_SLUG).expect(404))).toBe('ORDER_NOT_FOUND');
      await advance(order.id, as('ADMIN'), FLOW_SLUG).expect(200);
      // An ADMIN with no branch chosen cannot place an order in a multi-branch restaurant.
      const res = await http()
        .post(`/v1/${FLOW_SLUG}/orders`)
        .set(as('ADMIN'))
        .send({ items: [{ menuItemId: flow.stew, quantity: 1 }] })
        .expect(400);
      expect(codeOf(res)).toBe('BRANCH_REQUIRED');
      const chosen = await http()
        .post(`/v1/${FLOW_SLUG}/orders`)
        .set({ ...as('ADMIN'), 'x-dev-branch': flow.branch2 })
        .send({ items: [{ menuItemId: flow.branch2Only, quantity: 1 }] })
        .expect(201);
      expect((bodyOf(chosen) as OrderBody).branchId).toBe(flow.branch2);
    });
  });
});
