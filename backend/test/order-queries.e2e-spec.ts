import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { PrismaClient } from '../src/generated/prisma/client';
import { bodyOf } from './http';
import { ensureSeedTenants, unscopedClient, type SeedTenants } from './seed-tenants';
import { testConfig } from './test-config';

// B802 acceptance on real Postgres: an unchanged poll returns a cheap not-modified response;
// a status change appears in the next poll. Plus the stage/branch filters, the order detail and
// guest tracking. The fixture menu item has no recipe, so moving orders never touches stock.

const SLUG = 'nile-bites';
const run = Date.now().toString(36);
const TWO_SLUG = `two-branches-${run}`;

interface OrderJson {
  id: string;
  branchId: string;
  stageKey: string;
  status: string;
  canceledAt: string | null;
  items: { name: string; quantity: number }[];
  createdAt: string;
  updatedAt: string;
  trackingToken?: string | null;
}

describe('order queries for the board and tracking (B802)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let seed: SeedTenants;
  let dish: string;
  const http = () => request(app.getHttpServer());
  const as = (role: string) => ({ 'x-dev-role': role });
  const two = {
    tenantId: randomUUID(),
    branch1: randomUUID(),
    branch2: randomUUID(),
    admin: randomUUID(),
    worker1: randomUUID(),
    worker2: randomUUID(),
    dish: randomUUID(),
  };

  async function place(
    headers: Record<string, string> = as('WORKER'),
    slug = SLUG,
    menuItemId = dish,
  ) {
    const res = await http()
      .post(`/v1/${slug}/orders`)
      .set(headers)
      .send({ items: [{ menuItemId, quantity: 1 }] })
      .expect(201);
    return bodyOf(res) as OrderJson;
  }
  const advance = (id: string) =>
    http().post(`/v1/${SLUG}/orders/${id}/advance`).set(as('WORKER')).expect(200);
  const list = (query = '', headers: Record<string, string> = as('WORKER'), slug = SLUG) =>
    http().get(`/v1/${slug}/orders${query}`).set(headers);
  const ids = (res: { body: unknown }) => (bodyOf(res) as OrderJson[]).map((o) => o.id);

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = await ensureSeedTenants(prisma);
    dish = randomUUID();
    await prisma.menuItem.create({
      data: {
        id: dish,
        tenantId: seed.a.tenant.id,
        categoryId: seed.a.categories[0]!.id,
        name: `Board Dish ${run}`,
        price: '10.00',
      },
    });

    // A demo tenant with two branches, for branch scoping (WORKER sees only their own).
    const t = two;
    await prisma.tenant.create({
      data: { id: t.tenantId, slug: TWO_SLUG, name: 'Two Branches', timezone: 'UTC', isDemo: true },
    });
    await prisma.branch.createMany({
      data: [
        { id: t.branch1, tenantId: t.tenantId, name: 'North' },
        { id: t.branch2, tenantId: t.tenantId, name: 'South' },
      ],
    });
    await prisma.user.createMany({
      data: [
        { id: t.admin, tenantId: t.tenantId, name: 'Two Admin', role: 'ADMIN', isDemo: true },
        {
          id: t.worker1,
          tenantId: t.tenantId,
          branchId: t.branch1,
          name: 'North Worker',
          role: 'WORKER',
          isDemo: true,
        },
        {
          id: t.worker2,
          tenantId: t.tenantId,
          branchId: t.branch2,
          name: 'South Worker',
          role: 'WORKER',
        },
      ],
    });
    await prisma.orderWorkflowStage.createMany({
      data: seed.a.stages.map((s) => ({
        tenantId: t.tenantId,
        key: s.key,
        label: s.label,
        position: s.position,
        cancellable: s.cancellable,
        deductsInventory: s.deductsInventory,
      })),
    });
    const category = randomUUID();
    await prisma.category.create({ data: { id: category, tenantId: t.tenantId, name: 'Mains' } });
    await prisma.menuItem.create({
      data: { id: t.dish, tenantId: t.tenantId, categoryId: category, name: 'Plate', price: '5' },
    });

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

  describe('board list (acceptance)', () => {
    it('answers an unchanged poll with 304 and no body', async () => {
      await place();
      const first = await list().expect(200);
      const etag = first.headers.etag as string;
      expect(etag).toMatch(/^W\/"[0-9a-f]{32}"$/);
      expect(first.headers['cache-control']).toContain('no-cache');

      const again = await list().set('If-None-Match', etag).expect(304);
      expect(again.text ?? '').toBe('');
      expect(again.headers.etag).toBe(etag);
    });

    it('shows a status change in the next poll', async () => {
      const order = await place();
      const before = await list().expect(200);
      const etag = before.headers.etag as string;
      expect((bodyOf(before) as OrderJson[]).find((o) => o.id === order.id)?.stageKey).toBe(
        seed.a.stages[0]!.key,
      );

      await advance(order.id);
      const after = await list().set('If-None-Match', etag).expect(200);
      expect(after.headers.etag).not.toBe(etag);
      expect((bodyOf(after) as OrderJson[]).find((o) => o.id === order.id)?.stageKey).toBe(
        seed.a.stages[1]!.key,
      );
    });

    it('shows a new order and a cancellation in the next poll', async () => {
      const etag1 = (await list().expect(200)).headers.etag as string;
      const order = await place();
      const withNew = await list().set('If-None-Match', etag1).expect(200);
      expect(ids(withNew)).toContain(order.id);

      const etag2 = withNew.headers.etag as string;
      await http().post(`/v1/${SLUG}/orders/${order.id}/cancel`).set(as('WORKER')).expect(200);
      const afterCancel = await list().set('If-None-Match', etag2).expect(200);
      expect(ids(afterCancel)).not.toContain(order.id); // the board shows active orders only
      const all = await list('?scope=all').expect(200);
      expect((bodyOf(all) as OrderJson[]).find((o) => o.id === order.id)).toMatchObject({
        status: 'cancelled',
      });
    });
  });

  describe('filters', () => {
    it('lists active orders oldest first and drops orders in the last stage', async () => {
      const order = await place();
      for (let i = 1; i < seed.a.stages.length; i += 1) await advance(order.id); // to the last stage
      const active = bodyOf(await list().expect(200)) as OrderJson[];
      expect(active.map((o) => o.id)).not.toContain(order.id);
      const created = active.map((o) => o.createdAt);
      expect(created).toEqual([...created].sort());
      expect(active.every((o) => o.canceledAt === null)).toBe(true);
      const all = bodyOf(await list('?scope=all').expect(200)) as OrderJson[];
      expect(all.find((o) => o.id === order.id)).toMatchObject({
        stageKey: seed.a.stages.at(-1)!.key,
      });
      const allCreated = all.map((o) => o.createdAt);
      expect(allCreated).toEqual([...allCreated].sort().reverse());
    });

    it('filters by stage', async () => {
      const order = await place();
      await advance(order.id);
      const second = seed.a.stages[1]!.key;
      const rows = bodyOf(await list(`?stageKey=${second}`).expect(200)) as OrderJson[];
      expect(rows.map((o) => o.id)).toContain(order.id);
      expect(rows.every((o) => o.stageKey === second)).toBe(true);
      await list('?stageKey=Not A Key').expect(400);
    });

    it('keeps WORKERs to their own branch; ADMIN sees every branch or filters by one', async () => {
      const north = await place(as('WORKER'), TWO_SLUG, two.dish);
      const south = await place({ 'x-dev-user': two.worker2 }, TWO_SLUG, two.dish);

      const worker = ids(await list('', as('WORKER'), TWO_SLUG).expect(200));
      expect(worker).toContain(north.id);
      expect(worker).not.toContain(south.id);
      const forbidden = await list(`?branchId=${two.branch2}`, as('WORKER'), TWO_SLUG).expect(403);
      expect(bodyOf(forbidden)).toMatchObject({ code: 'BRANCH_FORBIDDEN' });
      await http().get(`/v1/${TWO_SLUG}/orders/${south.id}`).set(as('WORKER')).expect(404);

      const admin = ids(await list('', as('ADMIN'), TWO_SLUG).expect(200));
      expect(admin).toEqual(expect.arrayContaining([north.id, south.id]));
      const southOnly = ids(
        await list(`?branchId=${two.branch2}`, as('ADMIN'), TWO_SLUG).expect(200),
      );
      expect(southOnly).toEqual([south.id]);
    });

    it('is staff only', async () => {
      await list('', {}).expect(401);
      await http().get(`/v1/${SLUG}/orders/${randomUUID()}`).expect(401);
    });
  });

  describe('order detail', () => {
    it('returns the items and the stage history, with 304 until the order changes', async () => {
      const order = await place();
      await advance(order.id);
      const first = await http()
        .get(`/v1/${SLUG}/orders/${order.id}`)
        .set(as('WORKER'))
        .expect(200);
      expect(bodyOf(first)).toMatchObject({
        id: order.id,
        stageKey: seed.a.stages[1]!.key,
        items: [{ name: `Board Dish ${run}`, quantity: 1 }],
        history: [
          { action: 'PLACED', fromStageKey: null, toStageKey: seed.a.stages[0]!.key },
          {
            action: 'ADVANCED',
            fromStageKey: seed.a.stages[0]!.key,
            toStageKey: seed.a.stages[1]!.key,
          },
        ],
      });
      const etag = first.headers.etag as string;
      await http()
        .get(`/v1/${SLUG}/orders/${order.id}`)
        .set(as('WORKER'))
        .set('If-None-Match', etag)
        .expect(304);
      await advance(order.id);
      const after = await http()
        .get(`/v1/${SLUG}/orders/${order.id}`)
        .set(as('WORKER'))
        .set('If-None-Match', etag)
        .expect(200);
      expect((bodyOf(after) as { history: unknown[] }).history).toHaveLength(3);
    });

    it('answers 404 for an unknown order and 400 for a malformed id', async () => {
      const res = await http()
        .get(`/v1/${SLUG}/orders/${randomUUID()}`)
        .set(as('WORKER'))
        .expect(404);
      expect(bodyOf(res)).toMatchObject({ code: 'ORDER_NOT_FOUND' });
      await http().get(`/v1/${SLUG}/orders/not-a-uuid`).set(as('WORKER')).expect(400);
    });
  });

  describe('guest tracking', () => {
    it("shows the guest's order and the workflow, with 304 until it changes", async () => {
      const order = await place({});
      const token = order.trackingToken!;
      const first = await http().get(`/v1/${SLUG}/track/${token}`).expect(200);
      const body = bodyOf(first) as Record<string, unknown>;
      expect(body).toMatchObject({
        stageKey: seed.a.stages[0]!.key,
        status: seed.a.stages[0]!.key,
        canceledAt: null,
        total: '10.00',
        items: [{ name: `Board Dish ${run}`, quantity: 1, unitPrice: '10.00', lineTotal: '10.00' }],
      });
      expect((body.stages as { key: string }[]).map((s) => s.key)).toEqual(
        seed.a.stages.map((s) => s.key),
      );
      for (const hidden of ['id', 'placedBy', 'history', 'branchId', 'trackingToken']) {
        expect(Object.keys(body)).not.toContain(hidden);
      }

      const etag = first.headers.etag as string;
      await http().get(`/v1/${SLUG}/track/${token}`).set('If-None-Match', etag).expect(304);
      await advance(order.id);
      const after = await http()
        .get(`/v1/${SLUG}/track/${token}`)
        .set('If-None-Match', etag)
        .expect(200);
      expect(bodyOf(after)).toMatchObject({ stageKey: seed.a.stages[1]!.key });
    });

    it('answers 404 for an unknown or malformed token', async () => {
      await http()
        .get(`/v1/${SLUG}/track/${'A'.repeat(43)}`)
        .expect(404);
      await http().get(`/v1/${SLUG}/track/short`).expect(404);
    });
  });
});
