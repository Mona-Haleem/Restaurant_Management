import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { PrismaClient } from '../src/generated/prisma/client';
import { bodyOf } from './http';
import { ensureSeedTenants, unscopedClient, type SeedTenants } from './seed-tenants';
import { TenantProbeModule } from './tenant-probe.module';
import { testConfig } from './test-config';

// B503 acceptance (required suite, ARCHITECTURE §8 — never delete): tenant A cannot read or
// write tenant B's rows through any endpoint. Every /v1/{tenantSlug} route in openapi.json must
// have a case below, so each new endpoint (B601+) has to add its own.

const A_SLUG = 'nile-bites';
const B_SLUG = 'harbor-grill';

type Ctx = { http: () => ReturnType<typeof request>; seed: SeedTenants; prisma: PrismaClient };
type IsolationCase = (ctx: Ctx) => Promise<void>;

const ADMIN = { 'x-dev-role': 'ADMIN' };
const ids = (rows: unknown): string[] => (rows as { id: string }[]).map((r) => r.id);

/** B's menu item, as the database holds it, to prove a cross-tenant write changed nothing. */
async function bMenuItemRow(prisma: PrismaClient, seed: SeedTenants): Promise<unknown> {
  return prisma.menuItem.findUnique({
    where: { id: seed.bMenuItemId },
    select: { name: true, price: true, status: true, updatedAt: true },
  });
}

/** Expects every request to answer `status`, and B's menu item to stay exactly as it was. */
async function leavesBUnchanged(
  { http, seed, prisma }: Ctx,
  status: number,
  send: (agent: ReturnType<typeof request>) => request.Test,
): Promise<void> {
  const before = await bMenuItemRow(prisma, seed);
  await send(http()).set(ADMIN).expect(status);
  expect(await bMenuItemRow(prisma, seed)).toEqual(before);
}

/** One entry per tenant route of the real API: "METHOD /v1/{tenantSlug}/…". */
const ISOLATION_CASES: Record<string, IsolationCase> = {
  'GET /v1/{tenantSlug}/context': async ({ http, seed }) => {
    // The path picks the tenant; another tenant's identity is refused, never adopted.
    const bAdmin = seed.b.users.find((u) => u.role === 'ADMIN')!.id;
    const foreignUser = await http()
      .get(`/v1/${A_SLUG}/context`)
      .set('x-dev-user', bAdmin)
      .expect(401);
    expect(bodyOf(foreignUser)).toMatchObject({ code: 'DEV_IDENTITY_INVALID' });
    await http()
      .get(`/v1/${A_SLUG}/context`)
      .set('x-dev-role', 'ADMIN')
      .set('x-dev-branch', seed.b.branches[0]!.id)
      .expect(401);
    const own = await http().get(`/v1/${A_SLUG}/context`).set('x-dev-role', 'ADMIN').expect(200);
    expect(bodyOf(own)).toMatchObject({
      tenant: { id: seed.a.tenant.id },
      branchId: seed.a.branches[0]!.id,
    });
    expect(JSON.stringify(bodyOf(own))).not.toContain(seed.b.tenant.id);
  },

  // ── Catalog (B601) ──────────────────────────────────────────────────────────────────────
  'GET /v1/{tenantSlug}/menu': async ({ http, seed }) => {
    const a = bodyOf(await http().get(`/v1/${A_SLUG}/menu`).expect(200)) as {
      categories: unknown;
      items: unknown;
    };
    expect(ids(a.items)).not.toContain(seed.bMenuItemId);
    expect(ids(a.categories)).not.toContain(seed.bCategoryId);
    const b = bodyOf(await http().get(`/v1/${B_SLUG}/menu`).expect(200)) as { items: unknown };
    expect(ids(b.items)).toContain(seed.bMenuItemId);
    expect(ids(b.items).filter((id) => ids(a.items).includes(id))).toEqual([]);
  },
  'GET /v1/{tenantSlug}/categories': async ({ http, seed }) => {
    const res = await http().get(`/v1/${A_SLUG}/categories`).set(ADMIN).expect(200);
    expect(ids(bodyOf(res))).not.toContain(seed.bCategoryId);
    expect(ids(bodyOf(res))).toEqual(expect.arrayContaining(seed.a.categories.map((c) => c.id)));
  },
  'POST /v1/{tenantSlug}/categories': async ({ http, seed, prisma }) => {
    const res = await http()
      .post(`/v1/${A_SLUG}/categories`)
      .set(ADMIN)
      .send({ name: `Isolation ${Date.now()}` })
      .expect(201);
    const row = await prisma.category.findUnique({
      where: { id: (bodyOf(res) as { id: string }).id },
    });
    expect(row?.tenantId).toBe(seed.a.tenant.id);
    // Names are unique per tenant only: A may use B's category name.
    const bName = (await prisma.category.findUnique({ where: { id: seed.bCategoryId } }))!.name;
    const taken = await prisma.category.count({
      where: { tenantId: seed.a.tenant.id, name: bName },
    });
    if (taken === 0) {
      await http().post(`/v1/${A_SLUG}/categories`).set(ADMIN).send({ name: bName }).expect(201);
    }
  },
  'PATCH /v1/{tenantSlug}/categories/{id}': async ({ http, seed, prisma }) => {
    await http()
      .patch(`/v1/${A_SLUG}/categories/${seed.bCategoryId}`)
      .set(ADMIN)
      .send({ name: 'Hacked', isActive: false })
      .expect(404);
    const row = await prisma.category.findUnique({ where: { id: seed.bCategoryId } });
    expect(row).toMatchObject({ name: 'Seafood (tenant B)', isActive: true });
  },
  'GET /v1/{tenantSlug}/menu-items': async ({ http, seed }) => {
    const res = await http().get(`/v1/${A_SLUG}/menu-items`).set(ADMIN).expect(200);
    expect(ids(bodyOf(res))).not.toContain(seed.bMenuItemId);
    expect(ids(bodyOf(res)).length).toBeGreaterThan(0);
  },
  'GET /v1/{tenantSlug}/menu-items/{id}': async ({ http, seed }) => {
    await http().get(`/v1/${A_SLUG}/menu-items/${seed.bMenuItemId}`).set(ADMIN).expect(404);
    const aItem = seed.a.menuItems[0]!.id;
    await http().get(`/v1/${B_SLUG}/menu-items/${aItem}`).set(ADMIN).expect(404);
  },
  'POST /v1/{tenantSlug}/menu-items': async ({ http, seed, prisma }) => {
    const before = await prisma.menuItem.count({ where: { tenantId: seed.b.tenant.id } });
    const intoB = await http()
      .post(`/v1/${A_SLUG}/menu-items`)
      .set(ADMIN)
      .send({ categoryId: seed.bCategoryId, name: 'Sneaky', price: '1' })
      .expect(400);
    expect(bodyOf(intoB)).toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
    const bIngredient = await http()
      .post(`/v1/${A_SLUG}/menu-items`)
      .set(ADMIN)
      .send({
        categoryId: seed.a.categories[0]!.id,
        name: 'Borrowed fish',
        price: '1',
        ingredients: [{ inventoryItemId: seed.bInventoryItemId, quantity: '1', unit: 'KG' }],
      })
      .expect(400);
    expect(bodyOf(bIngredient)).toMatchObject({
      code: 'INVALID_RECIPE',
      details: { issues: [{ code: 'INVENTORY_ITEM_NOT_FOUND' }] },
    });
    expect(await prisma.menuItem.count({ where: { tenantId: seed.b.tenant.id } })).toBe(before);
  },
  'PATCH /v1/{tenantSlug}/menu-items/{id}': async (ctx) => {
    await leavesBUnchanged(ctx, 404, (agent) =>
      agent
        .patch(`/v1/${A_SLUG}/menu-items/${ctx.seed.bMenuItemId}`)
        .send({ name: 'Hacked', price: '0' }),
    );
    // A's own item cannot be pointed at B's category, branch or inventory item.
    const own = ctx.seed.a.menuItems.find((m) => m.status === 'ACTIVE')!.id;
    const attempts: [Record<string, unknown>, string][] = [
      [{ categoryId: ctx.seed.bCategoryId }, 'CATEGORY_NOT_FOUND'],
      [{ branchId: ctx.seed.b.branches[0]!.id }, 'BRANCH_NOT_FOUND'],
      [
        {
          ingredients: [{ inventoryItemId: ctx.seed.bInventoryItemId, quantity: '1', unit: 'KG' }],
        },
        'INVALID_RECIPE',
      ],
    ];
    for (const [body, code] of attempts) {
      const res = await ctx
        .http()
        .patch(`/v1/${A_SLUG}/menu-items/${own}`)
        .set(ADMIN)
        .send(body)
        .expect(400);
      expect(bodyOf(res)).toMatchObject({ code });
    }
  },
  'POST /v1/{tenantSlug}/menu-items/{id}/archive': (ctx) =>
    leavesBUnchanged(ctx, 404, (agent) =>
      agent.post(`/v1/${A_SLUG}/menu-items/${ctx.seed.bMenuItemId}/archive`),
    ),
  'POST /v1/{tenantSlug}/menu-items/{id}/restore': (ctx) =>
    leavesBUnchanged(ctx, 404, (agent) =>
      agent.post(`/v1/${A_SLUG}/menu-items/${ctx.seed.bMenuItemId}/restore`),
    ),

  // ── Orders (B801) ───────────────────────────────────────────────────────────────────────
  'GET /v1/{tenantSlug}/workflow': async ({ http, seed, prisma }) => {
    const res = await http().get(`/v1/${A_SLUG}/workflow`).expect(200);
    const aStages = await prisma.orderWorkflowStage.findMany({
      where: { tenantId: seed.a.tenant.id },
      orderBy: { position: 'asc' },
    });
    // Only A's rows: an unscoped read would return B's four defaults as well.
    expect((bodyOf(res) as { stages: { key: string }[] }).stages.map((s) => s.key)).toEqual(
      aStages.map((s) => s.key),
    );
  },
  'POST /v1/{tenantSlug}/orders': async ({ http, seed, prisma }) => {
    const bOrders = () => prisma.order.count({ where: { tenantId: seed.b.tenant.id } });
    const before = await bOrders();
    const res = await http()
      .post(`/v1/${A_SLUG}/orders`)
      .send({ items: [{ menuItemId: seed.bMenuItemId, quantity: 1 }] })
      .expect(400);
    expect(bodyOf(res)).toMatchObject({
      code: 'MENU_ITEM_UNAVAILABLE',
      details: { menuItemIds: [seed.bMenuItemId] },
    });
    const aItem = seed.a.menuItems.find((m) => m.status === 'ACTIVE')!.id;
    const ok = await http()
      .post(`/v1/${A_SLUG}/orders`)
      .send({ items: [{ menuItemId: aItem, quantity: 1 }] })
      .expect(201);
    const row = await prisma.order.findUnique({ where: { id: (bodyOf(ok) as { id: string }).id } });
    expect(row?.tenantId).toBe(seed.a.tenant.id);
    expect(await bOrders()).toBe(before);
  },
  'POST /v1/{tenantSlug}/orders/{id}/advance': async ({ http, seed, prisma }) => {
    const order = await bOrder(prisma, seed);
    await http().post(`/v1/${A_SLUG}/orders/${order.id}/advance`).set(ADMIN).expect(404);
    expect(await bOrderState(prisma, order.id)).toEqual(order.state);
  },
  'POST /v1/{tenantSlug}/orders/{id}/cancel': async ({ http, seed, prisma }) => {
    const order = await bOrder(prisma, seed);
    await http().post(`/v1/${A_SLUG}/orders/${order.id}/cancel`).set(ADMIN).expect(404);
    expect(await bOrderState(prisma, order.id)).toEqual(order.state);
  },
  'POST /v1/{tenantSlug}/track/{token}/cancel': async ({ http, seed, prisma }) => {
    const order = await bOrder(prisma, seed);
    const res = await http().post(`/v1/${A_SLUG}/track/${order.token}/cancel`).expect(404);
    expect(bodyOf(res)).toMatchObject({ code: 'ORDER_NOT_FOUND' });
    expect(await bOrderState(prisma, order.id)).toEqual(order.state);
  },

  // ── Waste (B901) ────────────────────────────────────────────────────────────────────────
  'POST /v1/{tenantSlug}/waste': async ({ http, seed, prisma }) => {
    const bTenant = seed.b.tenant.id;
    const counts = async () => ({
      ledger: await prisma.inventoryTransaction.count({ where: { tenantId: bTenant } }),
      waste: await prisma.wasteEntry.count({ where: { tenantId: bTenant } }),
      stock: await prisma.branchStock.findMany({
        where: { tenantId: bTenant, inventoryItemId: seed.bInventoryItemId },
      }),
    });
    const before = await counts();
    // B's item does not exist in A's tenant: 404, and nothing is written anywhere.
    const res = await http()
      .post(`/v1/${A_SLUG}/waste`)
      .set(ADMIN)
      .send({ inventoryItemId: seed.bInventoryItemId, quantity: '1', unit: 'KG', reason: 'x' })
      .expect(404);
    expect(bodyOf(res)).toMatchObject({ code: 'INVENTORY_ITEM_NOT_FOUND' });
    expect(
      await prisma.inventoryTransaction.count({
        where: { tenantId: seed.a.tenant.id, inventoryItemId: seed.bInventoryItemId },
      }),
    ).toBe(0);
    expect(await counts()).toEqual(before);
  },

  // ── Stock (B702) ────────────────────────────────────────────────────────────────────────
  'GET /v1/{tenantSlug}/stock': async ({ http, seed }) => {
    const res = await http().get(`/v1/${A_SLUG}/stock`).set(ADMIN).expect(200);
    const listed = (bodyOf(res) as { inventoryItemId: string }[]).map((r) => r.inventoryItemId);
    expect(listed).not.toContain(seed.bInventoryItemId);
    expect(listed.length).toBeGreaterThan(0);
  },
  'GET /v1/{tenantSlug}/stock/low': async ({ http, seed }) => {
    const res = await http().get(`/v1/${A_SLUG}/stock/low`).set(ADMIN).expect(200);
    const listed = (bodyOf(res) as { inventoryItemId: string }[]).map((r) => r.inventoryItemId);
    expect(listed).not.toContain(seed.bInventoryItemId);
  },
  'GET /v1/{tenantSlug}/stock/{inventoryItemId}': async ({ http, seed }) => {
    await http().get(`/v1/${A_SLUG}/stock/${seed.bInventoryItemId}`).set(ADMIN).expect(404);
    const aItem = seed.a.inventoryItems[0]!.id;
    await http().get(`/v1/${B_SLUG}/stock/${aItem}`).set(ADMIN).expect(404);
  },
  'POST /v1/{tenantSlug}/stock/{inventoryItemId}/restock': async ({ http, seed, prisma }) => {
    const bRows = () =>
      prisma.inventoryTransaction.count({ where: { inventoryItemId: seed.bInventoryItemId } });
    const before = await bRows();
    const res = await http()
      .post(`/v1/${A_SLUG}/stock/${seed.bInventoryItemId}/restock`)
      .set(ADMIN)
      .send({ quantity: '5' })
      .expect(404);
    expect(bodyOf(res)).toMatchObject({ code: 'INVENTORY_ITEM_NOT_FOUND' });
    expect(await bRows()).toBe(before);
    expect(
      await prisma.branchStock.count({ where: { inventoryItemId: seed.bInventoryItemId } }),
    ).toBe(0);
  },
};

/** A fresh guest order of tenant B, written directly (B is read-only through the API). */
async function bOrder(
  prisma: PrismaClient,
  seed: SeedTenants,
): Promise<{ id: string; token: string; state: unknown }> {
  const token = randomBytes(32).toString('base64url');
  const order = await prisma.order.create({
    data: {
      tenantId: seed.b.tenant.id,
      branchId: seed.b.branches[0]!.id,
      stageKey: 'pending',
      placedByType: 'GUEST',
      total: '0',
      trackingTokenHash: createHash('sha256').update(token).digest('hex'),
    },
  });
  return { id: order.id, token, state: await bOrderState(prisma, order.id) };
}

function bOrderState(prisma: PrismaClient, id: string): Promise<unknown> {
  return prisma.order.findUnique({
    where: { id },
    select: { stageKey: true, canceledAt: true, updatedAt: true },
  });
}

function tenantRoutes(): string[] {
  const spec = JSON.parse(readFileSync(path.join(__dirname, '..', 'openapi.json'), 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
  };
  return Object.entries(spec.paths)
    .filter(([p]) => p.startsWith('/v1/{tenantSlug}'))
    .flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`))
    .sort();
}

describe('tenant isolation (B503)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let seed: SeedTenants;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = await ensureSeedTenants(prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testConfig()), TenantProbeModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('has an isolation case for every tenant route in openapi.json', () => {
    const routes = tenantRoutes();
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((r) => !(r in ISOLATION_CASES))).toEqual([]);
    expect(Object.keys(ISOLATION_CASES).filter((r) => !routes.includes(r))).toEqual([]);
  });

  it('has no route outside /v1, /v1/health and /v1/{tenantSlug} (so none can dodge the check)', () => {
    const spec = JSON.parse(readFileSync(path.join(__dirname, '..', 'openapi.json'), 'utf8')) as {
      paths: Record<string, unknown>;
    };
    const other = Object.keys(spec.paths).filter(
      (p) => p !== '/v1' && !/^\/v1\/health(\/|$)/.test(p) && !p.startsWith('/v1/{tenantSlug}/'),
    );
    expect(other).toEqual([]);
  });

  it.each(Object.keys(ISOLATION_CASES))('%s', async (route) => {
    await ISOLATION_CASES[route]!({ http, seed, prisma });
  });

  describe('reads and writes through the tenant-scoped client', () => {
    it("404s on another tenant's row, in both directions", async () => {
      await http().get(`/v1/${A_SLUG}/probe/categories/${seed.bCategoryId}`).expect(404);
      await http().get(`/v1/${B_SLUG}/probe/categories/${seed.bCategoryId}`).expect(200);
      const aCategory = seed.a.categories[0]!.id;
      await http().get(`/v1/${B_SLUG}/probe/categories/${aCategory}`).expect(404);
    });

    it('lists only the path tenant', async () => {
      const res = await http().get(`/v1/${A_SLUG}/probe/categories`).expect(200);
      const rows = bodyOf(res) as { tenantId: string }[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((r) => r.tenantId !== seed.a.tenant.id)).toEqual([]);
    });

    it("cannot change another tenant's row", async () => {
      const res = await http()
        .patch(`/v1/${A_SLUG}/probe/categories/${seed.bCategoryId}`)
        .set('x-dev-role', 'ADMIN')
        .send({ name: 'Hacked' })
        .expect(200);
      expect(bodyOf(res)).toEqual({ count: 0 });
      const row = await prisma.category.findUnique({ where: { id: seed.bCategoryId } });
      expect(row?.name).toBe('Seafood (tenant B)');
    });

    it('writes into the path tenant, and refuses a row aimed at another tenant', async () => {
      const ok = await http()
        .post(`/v1/${A_SLUG}/probe/categories`)
        .set('x-dev-role', 'ADMIN')
        .send({ name: `Probe ${Date.now()}` })
        .expect(201);
      expect(bodyOf(ok)).toEqual({ tenantId: seed.a.tenant.id });

      const before = await prisma.category.count({ where: { tenantId: seed.b.tenant.id } });
      const refused = await http()
        .post(`/v1/${A_SLUG}/probe/categories`)
        .set('x-dev-role', 'ADMIN')
        .send({ name: 'Sneaky', tenantId: seed.b.tenant.id })
        .expect(500);
      expect(bodyOf(refused)).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: {},
      });
      expect(await prisma.category.count({ where: { tenantId: seed.b.tenant.id } })).toBe(before);
    });
  });

  describe('request context and access (ADR 0007)', () => {
    it('resolves a guest, and each demo role', async () => {
      const guest = await http().get(`/v1/${A_SLUG}/context`).expect(200);
      expect(bodyOf(guest)).toEqual({
        tenant: { id: seed.a.tenant.id, slug: A_SLUG, name: 'Nile Bites', isDemo: true },
        branchId: seed.a.branches[0]!.id,
        actor: null,
      });
      for (const role of ['ADMIN', 'MANAGER', 'WORKER']) {
        const user = seed.a.users.find((u) => u.role === role)!;
        const res = await http().get(`/v1/${A_SLUG}/context`).set('x-dev-role', role).expect(200);
        expect(bodyOf(res)).toMatchObject({ actor: { id: user.id, name: user.name, role } });
      }
    });

    it('answers 404 TENANT_NOT_FOUND for an unknown slug', async () => {
      const res = await http().get('/v1/no-such-restaurant/context').expect(404);
      expect(bodyOf(res)).toMatchObject({ code: 'TENANT_NOT_FOUND' });
    });

    it('answers 401 DEV_IDENTITY_INVALID for a bad role header', async () => {
      const res = await http().get(`/v1/${A_SLUG}/context`).set('x-dev-role', 'CHEF').expect(401);
      expect(bodyOf(res)).toEqual({
        code: 'DEV_IDENTITY_INVALID',
        message: expect.any(String) as unknown,
        details: { header: 'x-dev-role' },
      });
    });

    it('is staff-only by default, and checks @Roles', async () => {
      await http().get(`/v1/${A_SLUG}/probe/access/staff`).expect(401);
      await http().get(`/v1/${A_SLUG}/probe/access/staff`).set('x-dev-role', 'WORKER').expect(200);
      await http()
        .get(`/v1/${A_SLUG}/probe/access/managers`)
        .set('x-dev-role', 'WORKER')
        .expect(403);
      await http()
        .get(`/v1/${A_SLUG}/probe/access/managers`)
        .set('x-dev-role', 'MANAGER')
        .expect(200);
      await http()
        .get(`/v1/${A_SLUG}/probe/access/managers`)
        .set('x-dev-role', 'ADMIN')
        .expect(200);
    });

    it('allows writes only on the demo tenant', async () => {
      const res = await http()
        .post(`/v1/${B_SLUG}/probe/categories`)
        .set('x-dev-role', 'ADMIN')
        .send({ name: 'Blocked' })
        .expect(403);
      expect(bodyOf(res)).toMatchObject({ code: 'DEMO_READ_ONLY' });
      await http().get(`/v1/${B_SLUG}/probe/categories`).expect(200);
    });

    it('lets browsers send the x-dev-* headers (CORS)', async () => {
      const res = await http()
        .options(`/v1/${A_SLUG}/context`)
        .set('Origin', 'http://localhost:4200')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'x-dev-role,x-dev-user,x-dev-branch')
        .expect(204);
      const allowed = String(res.headers['access-control-allow-headers']);
      for (const header of ['x-dev-role', 'x-dev-user', 'x-dev-branch']) {
        expect(allowed).toContain(header);
      }
    });
  });
});
