import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { TENANT_DB, type TenantDb } from '../src/prisma/tenant-prisma';
import { bodyOf } from './http';
import { ensureSeedTenants, unscopedClient, type SeedTenants } from './seed-tenants';
import { testConfig } from './test-config';

// B901 acceptance on real Postgres: logged waste reduces stock immediately and appears in the
// ledger as a WASTE row with its reason and actor. Plus the refusals and the rollback.
// The fixture uses its own items, so the seed suites' stock checks hold.
// BRANCH_REQUIRED (an ADMIN with no branch) is proven in waste.service.spec.ts only: the demo
// tenant has one branch, and the multi-branch case would hit DEMO_READ_ONLY first.

const SLUG = 'nile-bites';
const run = Date.now().toString(36);
const D = (v: string) => new Prisma.Decimal(v);
type Json = Record<string, unknown>;

describe('waste logging (B901)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let seed: SeedTenants;
  let tenantId: string;
  let branchId: string;
  let workerId: string;
  let cheese: string;
  let milk: string;
  let sauce: string;
  let archived: string;
  const http = () => request(app.getHttpServer());
  const as = (role: string) => ({ 'x-dev-role': role });

  const stockOf = async (itemId: string): Promise<string | null> => {
    const row = await prisma.branchStock.findUnique({
      where: { tenantId_branchId_inventoryItemId: { tenantId, branchId, inventoryItemId: itemId } },
    });
    return row ? row.currentStock.toFixed(3) : null;
  };
  const rowsFor = (itemId: string) =>
    prisma.inventoryTransaction.findMany({ where: { tenantId, inventoryItemId: itemId } });
  const log = (body: Json, role = 'WORKER') =>
    http()
      .post(`/v1/${SLUG}/waste`)
      .set(as(role))
      .send({ inventoryItemId: cheese, quantity: '250', unit: 'G', reason: 'Dropped', ...body });

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = await ensureSeedTenants(prisma);
    tenantId = seed.a.tenant.id;
    branchId = seed.a.branches[0]!.id;
    workerId = seed.a.users.find((u) => u.role === 'WORKER')!.id;

    const item = (name: string, type: 'RAW' | 'MIXED', unit: 'KG' | 'L', isActive = true) => ({
      id: randomUUID(),
      tenantId,
      name: `${name} ${run}`,
      type,
      unit,
      isActive,
      standardUnitCost: '100.0000',
    });
    const items = [
      item('Waste Cheese', 'RAW', 'KG'),
      item('Waste Milk', 'RAW', 'L'),
      item('Waste Sauce', 'MIXED', 'L'),
      item('Waste Archived', 'RAW', 'KG', false),
    ];
    await prisma.inventoryItem.createMany({ data: items });
    [cheese, milk, sauce, archived] = items.map((i) => i.id) as [string, string, string, string];
    // Opening stock backed by a PURCHASE row, so stock = sum of the ledger holds.
    await prisma.inventoryTransaction.create({
      data: {
        tenantId,
        branchId,
        inventoryItemId: cheese,
        type: 'PURCHASE',
        quantityDelta: '2',
        unitCost: '120.0000',
        actorId: workerId,
      },
    });
    await prisma.branchStock.create({
      data: { tenantId, branchId, inventoryItemId: cheese, currentStock: '2', avgUnitCost: '120' },
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

  it('reduces stock immediately and writes one WASTE row with the reason, actor and cost', async () => {
    const before = await stockOf(cheese);
    const res = await log({
      quantity: '250',
      unit: 'G',
      reason: '  Dropped on the floor  ',
    }).expect(201);
    const body = bodyOf(res) as Json;
    expect(await stockOf(cheese)).toBe(D(before!).minus('0.25').toFixed(3));
    expect(body).toMatchObject({
      branchId,
      inventoryItemId: cheese,
      quantity: '250.000',
      unit: 'G',
      reason: 'Dropped on the floor',
      actorId: workerId,
      quantityDelta: '-0.250',
      stockAfter: D(before!).minus('0.25').toFixed(3),
      negative: false,
    });

    const ledgerRow = await prisma.inventoryTransaction.findUniqueOrThrow({
      where: { id: body.transactionId as string },
    });
    expect(ledgerRow).toMatchObject({
      tenantId,
      branchId,
      inventoryItemId: cheese,
      type: 'WASTE',
      note: 'Dropped on the floor',
      actorId: workerId,
      relatedOrderId: null,
    });
    expect(ledgerRow.quantityDelta.toFixed(3)).toBe('-0.250');
    expect(ledgerRow.unitCost?.toFixed(4)).toBe('120.0000');

    const entry = await prisma.wasteEntry.findUniqueOrThrow({ where: { id: body.id as string } });
    expect(entry).toMatchObject({
      tenantId,
      branchId,
      inventoryItemId: cheese,
      unit: 'G',
      reason: 'Dropped on the floor',
      transactionId: ledgerRow.id,
      actorId: workerId,
    });
    expect(entry.quantity.toFixed(3)).toBe('250.000');
  });

  it('keeps stock equal to the sum of the ledger', async () => {
    await log({ quantity: '0.1', unit: 'KG' }, 'MANAGER').expect(201);
    const rows = await prisma.inventoryTransaction.findMany({
      where: { tenantId, branchId, inventoryItemId: cheese },
    });
    const total = rows.reduce((sum, r) => sum.plus(r.quantityDelta), D('0'));
    expect(total.toFixed(3)).toBe(await stockOf(cheese));
  });

  it('lets WORKER, MANAGER and ADMIN log waste, as themselves', async () => {
    for (const role of ['WORKER', 'MANAGER', 'ADMIN']) {
      const res = await log({ quantity: '1', unit: 'G' }, role).expect(201);
      const actor = seed.a.users.find((u) => u.role === role)!.id;
      expect((bodyOf(res) as Json).actorId).toBe(actor);
    }
  });

  it('allows stock to go negative and flags it (ADR 0006)', async () => {
    const res = await log({ inventoryItemId: milk, quantity: '1.5', unit: 'L' }).expect(201);
    expect(bodyOf(res)).toMatchObject({ stockAfter: '-1.500', negative: true });
    expect(await stockOf(milk)).toBe('-1.500');
  });

  it.each([
    [
      'a MIXED item',
      () => ({ inventoryItemId: sauce, unit: 'L', quantity: '1' }),
      400,
      'MIXED_ITEM_NOT_STOCKED',
    ],
    ['an archived item', () => ({ inventoryItemId: archived }), 404, 'INVENTORY_ITEM_NOT_FOUND'],
    ['an unknown item', () => ({ inventoryItemId: randomUUID() }), 404, 'INVENTORY_ITEM_NOT_FOUND'],
    ['another dimension', () => ({ unit: 'ML' }), 400, 'UNIT_DIMENSION_MISMATCH'],
    [
      'too many decimals in the stock unit',
      () => ({ quantity: '0.5', unit: 'G' }),
      400,
      'QUANTITY_TOO_PRECISE',
    ],
  ])('refuses %s and writes nothing', async (_name, body, status, code) => {
    const fields = body();
    const target = ((fields as Json).inventoryItemId as string | undefined) ?? cheese;
    const stockBefore = await stockOf(target);
    const rowsBefore = (await rowsFor(target)).length;
    const entriesBefore = await prisma.wasteEntry.count({ where: { tenantId } });
    const res = await log(fields).expect(status);
    expect(bodyOf(res)).toMatchObject({ code });
    expect(await stockOf(target)).toBe(stockBefore);
    expect((await rowsFor(target)).length).toBe(rowsBefore);
    expect(await prisma.wasteEntry.count({ where: { tenantId } })).toBe(entriesBefore);
  });

  it.each([
    ['a zero quantity', { quantity: '0' }],
    ['a negative quantity', { quantity: '-1' }],
    ['a number instead of a decimal string', { quantity: 1 }],
    ['an unknown unit', { unit: 'LB' }],
    ['an empty reason', { reason: '   ' }],
    ['a reason over 200 characters', { reason: 'x'.repeat(201) }],
    ['a missing reason', { reason: undefined }],
    ['a branch in the body', { branchId: randomUUID() }],
  ])('rejects %s with VALIDATION_FAILED', async (_name, body) => {
    const res = await log(body).expect(400);
    expect(bodyOf(res)).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('is staff-only, and read-only outside the demo tenant', async () => {
    await http()
      .post(`/v1/${SLUG}/waste`)
      .send({ inventoryItemId: cheese, quantity: '1', unit: 'G', reason: 'Guest' })
      .expect(401);
    const other = await http()
      .post(`/v1/harbor-grill/waste`)
      .set(as('WORKER'))
      .send({ inventoryItemId: seed.bInventoryItemId, quantity: '1', unit: 'G', reason: 'B' })
      .expect(403);
    expect(bodyOf(other)).toMatchObject({ code: 'DEMO_READ_ONLY' });
  });

  it('rolls back the WASTE row and the stock when the entry cannot be written', async () => {
    const db = app.get<TenantDb>(TENANT_DB);
    const original = db.$transaction.bind(db);
    const spy = jest.spyOn(db, '$transaction').mockImplementationOnce(((
      fn: (tx: unknown) => Promise<unknown>,
      options?: unknown,
    ) =>
      original(async (tx) => {
        const failing = new Proxy(tx, {
          get: (target, key, receiver) =>
            key === 'wasteEntry'
              ? { create: () => Promise.reject(new Error('entry insert failed')) }
              : (Reflect.get(target, key, receiver) as unknown),
        });
        return fn(failing);
      }, options as never)) as never);
    const stockBefore = await stockOf(cheese);
    const rowsBefore = (await rowsFor(cheese)).length;
    let calls: number | undefined;
    try {
      const res = await log({ quantity: '5', unit: 'G' }).expect(500);
      expect(bodyOf(res)).toMatchObject({ code: 'INTERNAL_ERROR' });
    } finally {
      calls = spy.mock.calls.length; // read before mockRestore() clears it
      spy.mockRestore();
    }
    expect(calls).toBe(1);
    expect(await stockOf(cheese)).toBe(stockBefore);
    expect((await rowsFor(cheese)).length).toBe(rowsBefore);
  });
});
