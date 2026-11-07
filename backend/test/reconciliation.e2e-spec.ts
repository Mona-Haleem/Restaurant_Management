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

// B902 acceptance on real Postgres (ARCHITECTURE §8 required suite — never delete: logged waste
// is not double-counted in reconciliation): waste-only scenarios flag zero; a genuine gap flags
// exactly that gap; the next expected-stock calculation uses the new snapshot. Plus the
// one-transaction rollback and counts racing with other stock writers.
// Fixture items are this suite's own (no low-stock threshold), so the seed checks hold.

const SLUG = 'nile-bites';
const run = Date.now().toString(36);
const D = (v: string) => new Prisma.Decimal(v);
type Json = Record<string, unknown>;
/** One physical count per race round (litres). */
const RACE_COUNTS = ['990', '985', '980', '975', '970', '965', '960', '955'];
type Entry = {
  inventoryItemId: string;
  countedQuantity: string;
  expectedQuantity: string;
  gap: string;
  flagged: boolean;
  adjustmentTransactionId: string | null;
  snapshotId: string;
  stockAfter: string;
};

describe('reconciliation and snapshots (B902)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let seed: SeedTenants;
  let tenantId: string;
  let branchId: string;
  let managerId: string;
  const http = () => request(app.getHttpServer());
  const as = (role: string) => ({ 'x-dev-role': role });

  /** A fresh RAW item of this suite, restocked through the API (a PURCHASE row). */
  async function item(name: string, unit: 'KG' | 'L' = 'KG', opening = '10'): Promise<string> {
    const id = randomUUID();
    await prisma.inventoryItem.create({
      data: {
        id,
        tenantId,
        name: `${name} ${run}`,
        type: 'RAW',
        unit,
        standardUnitCost: '50.0000',
      },
    });
    await http()
      .post(`/v1/${SLUG}/stock/${id}/restock`)
      .set(as('MANAGER'))
      .send({ quantity: opening })
      .expect(201);
    return id;
  }
  const waste = (itemId: string, quantity: string, unit = 'KG') =>
    http()
      .post(`/v1/${SLUG}/waste`)
      .set(as('WORKER'))
      .send({ inventoryItemId: itemId, quantity, unit, reason: 'Spilled' })
      .expect(201);
  const count = (counts: Json[], role = 'MANAGER', note?: string) =>
    http()
      .post(`/v1/${SLUG}/reconciliations`)
      .set(as(role))
      .send({ counts, ...(note === undefined ? {} : { note }) });
  const countOne = async (itemId: string, quantity: string, unit = 'KG'): Promise<Entry> => {
    const res = await count([{ inventoryItemId: itemId, quantity, unit }]).expect(201);
    return (bodyOf(res) as { entries: Entry[] }).entries[0]!;
  };
  const stockOf = async (itemId: string): Promise<string> => {
    const row = await prisma.branchStock.findUniqueOrThrow({
      where: { tenantId_branchId_inventoryItemId: { tenantId, branchId, inventoryItemId: itemId } },
    });
    return row.currentStock.toFixed(3);
  };
  const ledgerOf = (itemId: string) =>
    prisma.inventoryTransaction.findMany({
      where: { tenantId, branchId, inventoryItemId: itemId },
      orderBy: { seq: 'asc' },
    });
  /** latest snapshot + Σ rows after it, straight from the tables (ARCHITECTURE §5). */
  const expectedFromTables = async (itemId: string): Promise<string> => {
    const snap = await prisma.inventorySnapshot.findFirst({
      where: { tenantId, branchId, inventoryItemId: itemId },
      orderBy: { throughSeq: 'desc' },
    });
    const rows = await ledgerOf(itemId);
    return rows
      .filter((r) => !snap || r.seq > snap.throughSeq)
      .reduce((sum, r) => sum.plus(r.quantityDelta), snap ? snap.quantity : D('0'))
      .toFixed(3);
  };

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = await ensureSeedTenants(prisma);
    tenantId = seed.a.tenant.id;
    branchId = seed.a.branches[0]!.id;
    managerId = seed.a.users.find((u) => u.role === 'MANAGER')!.id;
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

  // Quality guideline: the waste test comes before the calculation (required suite).
  it('flags zero when the only loss was waste that was already logged', async () => {
    const cheese = await item('Recon Cheese');
    await waste(cheese, '2');
    await waste(cheese, '500', 'G');
    const entry = await countOne(cheese, '7.5');
    expect(entry).toMatchObject({
      countedQuantity: '7.500',
      expectedQuantity: '7.500',
      gap: '0.000',
      flagged: false,
      adjustmentTransactionId: null,
      stockAfter: '7.500',
    });
    const rows = await ledgerOf(cheese);
    expect(rows.map((r) => r.type)).toEqual(['PURCHASE', 'WASTE', 'WASTE']);
    expect(await stockOf(cheese)).toBe('7.500');
  });

  it('flags exactly the unexplained gap and adjusts the stock to the count', async () => {
    const flour = await item('Recon Flour');
    await waste(flour, '1');
    const res = await count(
      [{ inventoryItemId: flour, quantity: '8200', unit: 'G' }],
      'MANAGER',
      'End of day',
    ).expect(201);
    const body = bodyOf(res) as Json & { entries: Entry[] };
    expect(body).toMatchObject({ branchId, actorId: managerId, note: 'End of day' });
    const entry = body.entries[0]!;
    expect(entry).toMatchObject({
      countedQuantity: '8.200',
      expectedQuantity: '9.000',
      gap: '-0.800',
      flagged: true,
      stockAfter: '8.200',
    });
    expect(await stockOf(flour)).toBe('8.200');

    const adjustment = await prisma.inventoryTransaction.findUniqueOrThrow({
      where: { id: entry.adjustmentTransactionId! },
    });
    expect(adjustment).toMatchObject({
      type: 'ADJUSTMENT',
      branchId,
      inventoryItemId: flour,
      actorId: managerId,
    });
    expect(adjustment.quantityDelta.toFixed(3)).toBe('-0.800');
    expect(adjustment.unitCost?.toFixed(4)).toBe('50.0000');

    const snapshot = await prisma.inventorySnapshot.findUniqueOrThrow({
      where: { id: entry.snapshotId },
    });
    expect(snapshot).toMatchObject({ branchId, inventoryItemId: flour });
    expect(snapshot.quantity.toFixed(3)).toBe('8.200');
    expect(snapshot.throughSeq).toBe(adjustment.seq); // the count includes its own adjustment

    const stored = await prisma.reconciliationEntry.findFirstOrThrow({
      where: { tenantId, snapshotId: entry.snapshotId },
    });
    expect(stored).toMatchObject({
      branchId,
      inventoryItemId: flour,
      adjustmentTransactionId: adjustment.id,
      actorId: managerId,
      note: 'End of day',
    });
    expect(stored.gap.toFixed(3)).toBe('-0.800');
  });

  it('records a surplus as a positive gap', async () => {
    const oil = await item('Recon Oil', 'L', '3');
    const entry = await countOne(oil, '3.25', 'L');
    expect(entry).toMatchObject({ gap: '0.250', flagged: true, stockAfter: '3.250' });
  });

  it('bases the next expected stock on the new snapshot', async () => {
    const rice = await item('Recon Rice');
    await countOne(rice, '9.5'); // gap −0.5: snapshot 9.5
    await waste(rice, '1');
    // A second count: 9.5 (snapshot) − 1 (waste since) = 8.5, not 10 − 1 from the old history.
    const second = await countOne(rice, '8.5');
    expect(second).toMatchObject({ expectedQuantity: '8.500', gap: '0.000', flagged: false });
    expect(await expectedFromTables(rice)).toBe('8.500');
    // The stock view (B702) uses the same snapshot.
    await waste(rice, '0.5');
    const view = await http().get(`/v1/${SLUG}/stock/${rice}`).set(as('MANAGER')).expect(200);
    expect(bodyOf(view)).toMatchObject({ expectedStock: '8.000', currentStock: '8.000' });
  });

  it('counts a whole sheet in one request, one entry and snapshot per item', async () => {
    const [a, b, c] = [await item('Recon A'), await item('Recon B'), await item('Recon C')];
    const res = await count([
      { inventoryItemId: c, quantity: '10', unit: 'KG' },
      { inventoryItemId: a, quantity: '9', unit: 'KG' },
      { inventoryItemId: b, quantity: '0', unit: 'KG' },
    ]).expect(201);
    const entries = (bodyOf(res) as { entries: Entry[] }).entries;
    expect(entries.map((e) => [e.inventoryItemId, e.gap])).toEqual([
      [c, '0.000'],
      [a, '-1.000'],
      [b, '-10.000'],
    ]);
    expect(new Set(entries.map((e) => e.snapshotId)).size).toBe(3);
    expect(await stockOf(b)).toBe('0.000');
  });

  it('counts an item that never had stock in this branch (expected 0)', async () => {
    const id = randomUUID();
    await prisma.inventoryItem.create({
      data: { id, tenantId, name: `Recon New ${run}`, type: 'RAW', unit: 'KG' },
    });
    const entry = await countOne(id, '2');
    expect(entry).toMatchObject({ expectedQuantity: '0.000', gap: '2.000', stockAfter: '2.000' });
    const adjustment = await prisma.inventoryTransaction.findUniqueOrThrow({
      where: { id: entry.adjustmentTransactionId! },
    });
    expect(adjustment.unitCost).toBeNull(); // no average, no standard cost (ADR 0005)
  });

  it('rolls back the adjustment, snapshot and stock when the entry cannot be written', async () => {
    const beans = await item('Recon Beans');
    const db = app.get<TenantDb>(TENANT_DB);
    const original = db.$transaction.bind(db);
    const spy = jest.spyOn(db, '$transaction').mockImplementationOnce(((
      fn: (tx: unknown) => Promise<unknown>,
      options?: unknown,
    ) =>
      original(async (tx) => {
        const failing = new Proxy(tx, {
          get: (target, key, receiver) =>
            key === 'reconciliationEntry'
              ? { create: () => Promise.reject(new Error('entry insert failed')) }
              : (Reflect.get(target, key, receiver) as unknown),
        });
        return fn(failing);
      }, options as never)) as never);
    const rowsBefore = (await ledgerOf(beans)).length;
    let calls: number | undefined;
    try {
      const res = await count([{ inventoryItemId: beans, quantity: '4', unit: 'KG' }]).expect(500);
      expect(bodyOf(res)).toMatchObject({ code: 'INTERNAL_ERROR' });
    } finally {
      calls = spy.mock.calls.length; // read before mockRestore() clears it
      spy.mockRestore();
    }
    expect(calls).toBe(1);
    expect(await stockOf(beans)).toBe('10.000');
    expect((await ledgerOf(beans)).length).toBe(rowsBefore);
    expect(await prisma.inventorySnapshot.count({ where: { inventoryItemId: beans } })).toBe(0);
  });

  it('keeps snapshot + rows since = current stock while counts race other writers', async () => {
    const milk = await item('Recon Milk', 'L', '1000');
    for (let round = 0; round < 8; round++) {
      const results = await Promise.all([
        http()
          .post(`/v1/${SLUG}/waste`)
          .set(as('WORKER'))
          .send({ inventoryItemId: milk, quantity: '1', unit: 'L', reason: 'Race' }),
        count([{ inventoryItemId: milk, quantity: RACE_COUNTS[round]!, unit: 'L' }]),
        http().post(`/v1/${SLUG}/stock/${milk}/restock`).set(as('MANAGER')).send({ quantity: '2' }),
        http()
          .post(`/v1/${SLUG}/waste`)
          .set(as('WORKER'))
          .send({ inventoryItemId: milk, quantity: '250', unit: 'ML', reason: 'Race' }),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(await expectedFromTables(milk)).toBe(await stockOf(milk));
    }
    // Every count's own entry agrees with the table state it saw.
    const entries = await prisma.reconciliationEntry.findMany({
      where: { tenantId, inventoryItemId: milk },
    });
    expect(entries).toHaveLength(8);
    for (const e of entries) {
      expect(e.countedQuantity.minus(e.expectedQuantity).equals(e.gap)).toBe(true);
    }
  });

  it.each([
    ['a MIXED item', 'mixed', 400, 'MIXED_ITEM_NOT_STOCKED'],
    ['an unknown item', 'unknown', 404, 'INVENTORY_ITEM_NOT_FOUND'],
    ['another dimension', 'dimension', 400, 'UNIT_DIMENSION_MISMATCH'],
    ['too many decimals in the stock unit', 'precise', 400, 'QUANTITY_TOO_PRECISE'],
    ['the same item twice', 'duplicate', 400, 'DUPLICATE_COUNT'],
  ])('refuses %s and writes nothing', async (_name, kind, status, code) => {
    const good = await item(`Recon Refuse ${kind}`);
    const other = await item(`Recon Refuse other ${kind}`);
    const mixed = randomUUID();
    if (kind === 'mixed') {
      await prisma.inventoryItem.create({
        data: { id: mixed, tenantId, name: `Recon Mixed ${run}`, type: 'MIXED', unit: 'L' },
      });
    }
    const bad: Record<string, Json> = {
      mixed: { inventoryItemId: mixed, quantity: '1', unit: 'L' },
      unknown: { inventoryItemId: randomUUID(), quantity: '1', unit: 'KG' },
      dimension: { inventoryItemId: other, quantity: '1', unit: 'L' },
      precise: { inventoryItemId: other, quantity: '0.5', unit: 'G' },
      duplicate: { inventoryItemId: good, quantity: '2', unit: 'KG' },
    };
    const rowsBefore = (await ledgerOf(good)).length;
    // The good line comes first: the whole sheet is refused, so it is not applied either.
    const res = await count([{ inventoryItemId: good, quantity: '3', unit: 'KG' }, bad[kind]!]);
    expect(res.status).toBe(status);
    expect(bodyOf(res)).toMatchObject({ code });
    expect(await stockOf(good)).toBe('10.000');
    expect(await stockOf(other)).toBe('10.000');
    expect((await ledgerOf(good)).length).toBe(rowsBefore);
    expect(await prisma.reconciliationEntry.count({ where: { inventoryItemId: good } })).toBe(0);
  });

  it.each([
    ['no counts', { counts: [] }],
    [
      'a negative count',
      { counts: [{ inventoryItemId: randomUUID(), quantity: '-1', unit: 'KG' }] },
    ],
    [
      'a number instead of a string',
      { counts: [{ inventoryItemId: randomUUID(), quantity: 1, unit: 'KG' }] },
    ],
    ['a missing unit', { counts: [{ inventoryItemId: randomUUID(), quantity: '1' }] }],
    [
      'a note over 500 characters',
      {
        counts: [{ inventoryItemId: randomUUID(), quantity: '1', unit: 'KG' }],
        note: 'x'.repeat(501),
      },
    ],
    [
      'a branch in the body',
      {
        counts: [{ inventoryItemId: randomUUID(), quantity: '1', unit: 'KG' }],
        branchId: randomUUID(),
      },
    ],
  ])('rejects %s with VALIDATION_FAILED', async (_name, body) => {
    const res = await http()
      .post(`/v1/${SLUG}/reconciliations`)
      .set(as('MANAGER'))
      .send(body)
      .expect(400);
    expect(bodyOf(res)).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('accepts an id in upper case as the same item, and catches it as a duplicate', async () => {
    const tea = await item('Recon Tea');
    const entry = await countOne(tea.toUpperCase(), '9');
    expect(entry).toMatchObject({ inventoryItemId: tea, gap: '-1.000', stockAfter: '9.000' });
    const twice = await count([
      { inventoryItemId: tea, quantity: '8', unit: 'KG' },
      { inventoryItemId: tea.toUpperCase(), quantity: '7', unit: 'KG' },
    ]);
    expect(twice.status).toBe(400);
    expect(bodyOf(twice)).toMatchObject({ code: 'DUPLICATE_COUNT' });
    expect(await stockOf(tea)).toBe('9.000');
  });

  it('refuses a count too large for the stock unit after conversion (QUANTITY_TOO_LARGE)', async () => {
    const id = randomUUID();
    await prisma.inventoryItem.create({
      data: { id, tenantId, name: `Recon Saffron ${run}`, type: 'RAW', unit: 'G' },
    });
    // 99,999,999,999 KG fits the column as entered, but not as grams.
    const res = await count([{ inventoryItemId: id, quantity: '99999999999', unit: 'KG' }]);
    expect(res.status).toBe(400);
    expect(bodyOf(res)).toMatchObject({ code: 'QUANTITY_TOO_LARGE' });
    expect(await prisma.inventorySnapshot.count({ where: { inventoryItemId: id } })).toBe(0);
  });

  it('is for managers and admins, and read-only outside the demo tenant', async () => {
    const sugar = await item('Recon Sugar');
    const line = [{ inventoryItemId: sugar, quantity: '10', unit: 'KG' }];
    const worker = await count(line, 'WORKER').expect(403);
    expect(bodyOf(worker)).toMatchObject({ code: 'ROLE_FORBIDDEN' });
    await http().post(`/v1/${SLUG}/reconciliations`).send({ counts: line }).expect(401);
    await count(line, 'ADMIN').expect(201);
    const other = await http()
      .post(`/v1/harbor-grill/reconciliations`)
      .set(as('MANAGER'))
      .send({ counts: [{ inventoryItemId: seed.bInventoryItemId, quantity: '1', unit: 'KG' }] })
      .expect(403);
    expect(bodyOf(other)).toMatchObject({ code: 'DEMO_READ_ONLY' });
  });
});
