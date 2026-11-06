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

type Ctx = { http: () => ReturnType<typeof request>; seed: SeedTenants };
type IsolationCase = (ctx: Ctx) => Promise<void>;

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
};

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
    await ISOLATION_CASES[route]!({ http, seed });
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
