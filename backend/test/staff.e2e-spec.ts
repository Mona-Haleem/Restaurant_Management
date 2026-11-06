import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { PrismaClient } from '../src/generated/prisma/client';
import { bodyOf } from './http';
import { ensureSeedTenants, unscopedClient, type SeedTenants } from './seed-tenants';
import { testConfig } from './test-config';

// B1001 on real Postgres: list, create, deactivate (never delete) and assign roles; passwords are
// argon2 hashes and never leave the API. Acceptance: a deactivated worker disappears from active
// selections while historical orders still show their name.

const SLUG = 'nile-bites';
type Staff = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  branchId: string | null;
  isActive: boolean;
};

describe('staff (B1001)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let seed: SeedTenants;
  let mainBranch: string;
  let otherBranch: string;
  const http = () => request(app.getHttpServer());
  const as = (role: string) => ({ 'x-dev-role': role });
  const tag = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const demoUser = (role: string) => seed.a.users.find((u) => u.role === role)!;

  const createStaff = async (
    body: Record<string, unknown> = {},
    role = 'ADMIN',
  ): Promise<Staff> => {
    const t = tag();
    const res = await http()
      .post(`/v1/${SLUG}/staff`)
      .set(as(role))
      .send({
        name: `Test Worker ${t}`,
        email: `worker-${t}@nile-bites.example`,
        password: 'a-long-password',
        role: 'WORKER',
        branchId: mainBranch,
        ...body,
      })
      .expect(201);
    return bodyOf(res) as Staff;
  };
  const listIds = async (query = '', role = 'ADMIN'): Promise<string[]> => {
    const res = await http().get(`/v1/${SLUG}/staff${query}`).set(as(role)).expect(200);
    return (bodyOf(res) as Staff[]).map((s) => s.id);
  };

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = await ensureSeedTenants(prisma);
    mainBranch = seed.a.branches[0]!.id;
    otherBranch = (
      await prisma.branch.create({
        data: { tenantId: seed.a.tenant.id, name: `Staff test branch ${tag()}` },
      })
    ).id;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testConfig())],
    }).compile();
    app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    // The extra branch would make the demo tenant multi-branch for later suites (ADR 0007).
    await prisma.user.updateMany({ where: { branchId: otherBranch }, data: { isActive: false } });
    await prisma.branch.update({ where: { id: otherBranch }, data: { isActive: false } });
    await prisma.$disconnect();
  });

  describe('create and list', () => {
    it('creates a worker with an argon2id hash that never appears in a response', async () => {
      const created = await createStaff({ email: 'Mixed.Case@Nile-Bites.example ' });
      expect(Object.keys(created).sort()).toEqual(
        ['branchId', 'email', 'id', 'isActive', 'name', 'role', 'updatedAt'].sort(),
      );
      expect(created).toMatchObject({
        email: 'mixed.case@nile-bites.example',
        role: 'WORKER',
        branchId: mainBranch,
        isActive: true,
      });
      const row = await prisma.user.findUnique({ where: { id: created.id } });
      expect(row?.tenantId).toBe(seed.a.tenant.id);
      expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
      await expect(argon2.verify(row!.passwordHash!, 'a-long-password')).resolves.toBe(true);

      const list = await http().get(`/v1/${SLUG}/staff`).set(as('ADMIN')).expect(200);
      const one = await http().get(`/v1/${SLUG}/staff/${created.id}`).set(as('ADMIN')).expect(200);
      for (const body of [list.text, one.text]) {
        expect(body).not.toContain('password');
        expect(body).not.toContain('$argon2');
      }
      expect((bodyOf(list) as Staff[]).map((s) => s.id)).toContain(created.id);
      expect(bodyOf(one)).toEqual(created);
    });

    it('refuses a taken email in any case', async () => {
      const res = await http()
        .post(`/v1/${SLUG}/staff`)
        .set(as('ADMIN'))
        .send({
          name: 'Copy',
          email: demoUser('WORKER').email!.toUpperCase(),
          branchId: mainBranch,
          password: 'a-long-password',
          role: 'WORKER',
        })
        .expect(409);
      expect(bodyOf(res)).toMatchObject({ code: 'STAFF_EMAIL_TAKEN' });
    });

    it('validates the password, the branch and the role/branch pairing', async () => {
      const base = { name: 'Bad', password: 'a-long-password', role: 'WORKER' };
      const cases: [Record<string, unknown>, string][] = [
        [{ ...base, password: 'short' }, 'VALIDATION_FAILED'],
        [{ ...base, role: 'OWNER' }, 'VALIDATION_FAILED'],
        [{ ...base, branchId: seed.b.branches[0]!.id }, 'BRANCH_NOT_FOUND'],
        [{ ...base, role: 'ADMIN', branchId: mainBranch }, 'BRANCH_NOT_ALLOWED'],
        [{ ...base, passwordHash: 'x' }, 'VALIDATION_FAILED'],
      ];
      for (const [body, code] of cases) {
        const res = await http().post(`/v1/${SLUG}/staff`).set(as('ADMIN')).send(body).expect(400);
        expect(bodyOf(res)).toMatchObject({ code });
      }
    });

    it('filters by status, role and branch', async () => {
      const inOther = await createStaff({ branchId: otherBranch });
      expect(await listIds(`?branchId=${otherBranch}`)).toEqual([inOther.id]);
      const managers = await http()
        .get(`/v1/${SLUG}/staff?role=MANAGER`)
        .set(as('ADMIN'))
        .expect(200);
      expect((bodyOf(managers) as Staff[]).every((s) => s.role === 'MANAGER')).toBe(true);
    });
  });

  describe('roles and deactivation', () => {
    it('assigns roles: ADMIN has no branch, MANAGER/WORKER need one', async () => {
      const s = await createStaff();
      const patch = (body: Record<string, unknown>) =>
        http().patch(`/v1/${SLUG}/staff/${s.id}`).set(as('ADMIN')).send(body);
      expect(bodyOf(await patch({ role: 'MANAGER' }).expect(200))).toMatchObject({
        role: 'MANAGER',
        branchId: mainBranch,
      });
      expect(bodyOf(await patch({ role: 'ADMIN' }).expect(200))).toMatchObject({
        role: 'ADMIN',
        branchId: null,
      });
      expect(bodyOf(await patch({ role: 'WORKER', branchId: null }).expect(400))).toMatchObject({
        code: 'BRANCH_REQUIRED',
      });
      expect(
        bodyOf(await patch({ role: 'WORKER', branchId: otherBranch }).expect(200)),
      ).toMatchObject({ role: 'WORKER', branchId: otherBranch });
      expect(bodyOf(await patch({ name: null }).expect(400))).toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });

    it('deactivates and reactivates without deleting the row', async () => {
      const s = await createStaff();
      await http()
        .patch(`/v1/${SLUG}/staff/${s.id}`)
        .set(as('ADMIN'))
        .send({ isActive: false })
        .expect(200);
      expect(await prisma.user.findUnique({ where: { id: s.id } })).toMatchObject({
        isActive: false,
      });
      const back = await http()
        .patch(`/v1/${SLUG}/staff/${s.id}`)
        .set(as('ADMIN'))
        .send({ isActive: true })
        .expect(200);
      expect(bodyOf(back)).toMatchObject({ isActive: true });
    });

    it('protects demo users and refuses deactivating yourself', async () => {
      const demoWorker = demoUser('WORKER').id;
      for (const body of [{ isActive: false }, { role: 'MANAGER' }]) {
        const res = await http()
          .patch(`/v1/${SLUG}/staff/${demoWorker}`)
          .set(as('ADMIN'))
          .send(body)
          .expect(409);
        expect(bodyOf(res)).toMatchObject({ code: 'DEMO_USER_PROTECTED' });
      }
      const admin = await createStaff({ role: 'ADMIN', branchId: undefined });
      const self = await http()
        .patch(`/v1/${SLUG}/staff/${admin.id}`)
        .set('x-dev-user', admin.id)
        .set('x-dev-branch', mainBranch)
        .send({ isActive: false })
        .expect(409);
      expect(bodyOf(self)).toMatchObject({ code: 'CANNOT_DEACTIVATE_SELF' });
    });

    it('404s an unknown id', async () => {
      const res = await http()
        .patch(`/v1/${SLUG}/staff/00000000-0000-4000-8000-000000000000`)
        .set(as('ADMIN'))
        .send({ isActive: false })
        .expect(404);
      expect(bodyOf(res)).toMatchObject({ code: 'STAFF_NOT_FOUND' });
    });
  });

  describe('access', () => {
    it('is staff management for ADMIN and MANAGER only', async () => {
      expect(bodyOf(await http().get(`/v1/${SLUG}/staff`).expect(401))).toMatchObject({
        code: 'AUTH_REQUIRED',
      });
      const worker = await http().get(`/v1/${SLUG}/staff`).set(as('WORKER')).expect(403);
      expect(bodyOf(worker)).toMatchObject({ code: 'ROLE_FORBIDDEN' });
    });

    it('refuses writes on a non-demo tenant', async () => {
      const res = await http()
        .post(`/v1/harbor-grill/staff`)
        .set(as('ADMIN'))
        .send({ name: 'X', password: 'a-long-password', role: 'WORKER' })
        .expect(403);
      expect(bodyOf(res)).toMatchObject({ code: 'DEMO_READ_ONLY' });
    });

    it('limits a MANAGER to the workers of their own branch', async () => {
      const elsewhere = await createStaff({ branchId: otherBranch });
      const visible = await listIds('', 'MANAGER');
      expect(visible).not.toContain(elsewhere.id);
      expect(visible).not.toContain(demoUser('ADMIN').id);
      expect(visible).toContain(demoUser('WORKER').id);
      await http().get(`/v1/${SLUG}/staff/${elsewhere.id}`).set(as('MANAGER')).expect(404);
      await http()
        .patch(`/v1/${SLUG}/staff/${elsewhere.id}`)
        .set(as('MANAGER'))
        .send({ isActive: false })
        .expect(404);

      const mine = await createStaff({ branchId: undefined }, 'MANAGER');
      expect(mine).toMatchObject({ role: 'WORKER', branchId: mainBranch });
      await http()
        .patch(`/v1/${SLUG}/staff/${mine.id}`)
        .set(as('MANAGER'))
        .send({ isActive: false })
        .expect(200);

      const forbidden: [string, string, Record<string, unknown>][] = [
        ['post', '', { name: 'M', password: 'a-long-password', role: 'MANAGER' }],
        ['patch', `/${mine.id}`, { role: 'MANAGER' }],
        ['patch', `/${demoUser('MANAGER').id}`, { name: 'Renamed' }],
      ];
      for (const [method, suffix, body] of forbidden) {
        const url = `/v1/${SLUG}/staff${suffix}`;
        const res = await (method === 'post' ? http().post(url) : http().patch(url))
          .set(as('MANAGER'))
          .send(body)
          .expect(403);
        expect(bodyOf(res)).toMatchObject({ code: 'STAFF_FORBIDDEN' });
      }
    });
  });

  it('acceptance: a deactivated worker leaves active selections, history keeps their name', async () => {
    const worker = await createStaff();
    const tenantId = seed.a.tenant.id;
    const stage = await prisma.orderWorkflowStage.findFirstOrThrow({
      where: { tenantId },
      orderBy: { position: 'asc' },
    });
    const order = await prisma.order.create({
      data: {
        tenantId,
        branchId: mainBranch,
        stageKey: stage.key,
        placedByType: 'STAFF',
        placedById: worker.id,
        total: '10.00',
        // Kept on purpose (no hard deletes); the note marks it for suites that count orders.
        note: 'staff e2e: placed by a worker who is then deactivated',
      },
    });
    await prisma.orderStageHistory.create({
      data: {
        tenantId,
        orderId: order.id,
        action: 'PLACED',
        toStageKey: stage.key,
        actorId: worker.id,
      },
    });
    expect(await listIds('?status=ACTIVE')).toContain(worker.id);

    await http()
      .patch(`/v1/${SLUG}/staff/${worker.id}`)
      .set(as('ADMIN'))
      .send({ isActive: false })
      .expect(200);

    // Gone from every active selection: the active staff list and the dev identity picker.
    expect(await listIds('?status=ACTIVE')).not.toContain(worker.id);
    expect(await listIds('?status=INACTIVE')).toContain(worker.id);
    const asThem = await http().get(`/v1/${SLUG}/context`).set('x-dev-user', worker.id).expect(401);
    expect(bodyOf(asThem)).toMatchObject({ code: 'DEV_IDENTITY_INVALID' });

    // History still resolves to the person: the row is kept and its name is unchanged.
    const one = await http().get(`/v1/${SLUG}/staff/${worker.id}`).set(as('ADMIN')).expect(200);
    expect(bodyOf(one)).toMatchObject({ name: worker.name, isActive: false });
    const history = await prisma.orderStageHistory.findFirstOrThrow({
      where: { tenantId, orderId: order.id },
      select: { actor: { select: { name: true } } },
    });
    expect(history.actor?.name).toBe(worker.name);
    const placedBy = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: placedBy.placedById! } })).name,
    ).toBe(worker.name);
  });
});
