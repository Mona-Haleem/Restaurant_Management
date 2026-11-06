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

// B702 acceptance on real Postgres: a restock increases a non-zero starting stock by the entered
// amount and produces a matching PURCHASE row. Plus the stock view, low-stock list, expected
// stock, MIXED derived stock and the customer menu availability flag (ADR 0021).
// Fixture items have no low-stock threshold, so the seed suite's low-stock check is unaffected.

const SLUG = 'nile-bites';
const run = Date.now().toString(36);
type Json = Record<string, unknown>;

describe('stock and restock (B702)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let seed: SeedTenants;
  let tenantId: string;
  let branchId: string;
  let managerId: string;
  const fx = { beef: '', cheese: '', empty: '', short: '', sauce: '', burger: '' };
  const http = () => request(app.getHttpServer());
  const as = (role: string) => ({ 'x-dev-role': role });

  /** An item with opening stock backed by a PURCHASE row, so the ledger invariant holds. */
  async function stocked(
    name: string,
    unit: 'KG' | 'PCS',
    qty: string | null,
    cost: string | null,
  ) {
    const id = randomUUID();
    await prisma.inventoryItem.create({
      data: {
        id,
        tenantId,
        name: `${name} ${run}`,
        type: 'RAW',
        unit,
        standardUnitCost: '10.0000',
      },
    });
    if (qty !== null) {
      if (qty !== '0') {
        await prisma.inventoryTransaction.create({
          data: {
            tenantId,
            branchId,
            inventoryItemId: id,
            type: 'PURCHASE',
            quantityDelta: qty,
            unitCost: cost,
            actorId: managerId,
          },
        });
      }
      await prisma.branchStock.create({
        data: { tenantId, branchId, inventoryItemId: id, currentStock: qty, avgUnitCost: cost },
      });
    }
    return id;
  }
  const stockRow = (inventoryItemId: string) =>
    prisma.branchStock.findUnique({
      where: { tenantId_branchId_inventoryItemId: { tenantId, branchId, inventoryItemId } },
    });

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = await ensureSeedTenants(prisma);
    tenantId = seed.a.tenant.id;
    branchId = seed.a.branches[0]!.id;
    managerId = seed.a.users.find((u) => u.role === 'MANAGER')!.id;

    fx.beef = await stocked('Stock Beef', 'KG', '7.25', '400.0000');
    fx.cheese = await stocked('Stock Cheese', 'KG', '2', '300.0000');
    fx.empty = await stocked('Stock Empty', 'PCS', '0', null);
    fx.short = await stocked('Stock Short', 'PCS', null, null); // never stocked
    // A sauce from beef (0.5 KG per L) and cheese (0.25 KG per L): derived = min(14.5, 8) = 8 L.
    fx.sauce = randomUUID();
    await prisma.inventoryItem.create({
      data: { id: fx.sauce, tenantId, name: `Stock Sauce ${run}`, type: 'MIXED', unit: 'L' },
    });
    await prisma.inventoryItemComponent.createMany({
      data: [
        { tenantId, mixedItemId: fx.sauce, componentItemId: fx.beef, quantity: '0.5', unit: 'KG' },
        { tenantId, mixedItemId: fx.sauce, componentItemId: fx.cheese, quantity: '250', unit: 'G' },
      ],
    });
    // A menu item that needs one "short" piece per serving: unavailable until it is restocked.
    fx.burger = randomUUID();
    await prisma.menuItem.create({
      data: {
        id: fx.burger,
        tenantId,
        categoryId: seed.a.categories[0]!.id,
        name: `Stock Burger ${run}`,
        price: '10.00',
      },
    });
    await prisma.menuItemIngredient.createMany({
      data: [
        { tenantId, menuItemId: fx.burger, inventoryItemId: fx.short, quantity: '1', unit: 'PCS' },
        { tenantId, menuItemId: fx.burger, inventoryItemId: fx.sauce, quantity: '100', unit: 'ML' },
      ],
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

  describe('restock (acceptance)', () => {
    it('increases a non-zero starting stock by the entered amount, with a matching PURCHASE row', async () => {
      const res = await http()
        .post(`/v1/${SLUG}/stock/${fx.beef}/restock`)
        .set(as('MANAGER'))
        .send({ quantity: '500', unit: 'G', unitCost: '0.42', note: 'Butcher, invoice 118' })
        .expect(201);
      // 7.25 KG + 500 G = 7.75 KG; 0.42 per G = 420 per KG;
      // average (7.25 x 400 + 0.5 x 420) / 7.75 = 401.29032… → 401.2903 (ADR 0005)
      const body = bodyOf(res) as Json;
      expect(body).toMatchObject({
        inventoryItemId: fx.beef,
        quantityDelta: '0.500',
        unitCost: '420.0000',
        stockAfter: '7.750',
        avgUnitCost: '401.2903',
      });
      const row = await prisma.inventoryTransaction.findUnique({
        where: { id: String(body.transactionId) },
      });
      expect(row).toMatchObject({
        type: 'PURCHASE',
        inventoryItemId: fx.beef,
        branchId,
        actorId: managerId,
        note: 'Butcher, invoice 118',
      });
      expect([row?.quantityDelta.toFixed(3), row?.unitCost?.toFixed(4)]).toEqual([
        '0.500',
        '420.0000',
      ]);
      const stock = await stockRow(fx.beef);
      expect([stock?.currentStock.toFixed(3), stock?.avgUnitCost?.toFixed(4)]).toEqual([
        '7.750',
        '401.2903',
      ]);
    });

    it('without a cost: stores the current average on the row and leaves the average alone', async () => {
      const res = await http()
        .post(`/v1/${SLUG}/stock/${fx.cheese}/restock`)
        .set(as('ADMIN'))
        .send({ quantity: '1.5' })
        .expect(201);
      expect(bodyOf(res)).toMatchObject({
        quantityDelta: '1.500',
        unitCost: '300.0000',
        stockAfter: '3.500',
        avgUnitCost: '300.0000',
      });
    });

    it('creates the stock row of a never-stocked item, starting from the purchase cost', async () => {
      const res = await http()
        .post(`/v1/${SLUG}/stock/${fx.short}/restock`)
        .set(as('MANAGER'))
        .send({ quantity: '2', unitCost: '12.5' })
        .expect(201);
      expect(bodyOf(res)).toMatchObject({ stockAfter: '2.000', avgUnitCost: '12.5000' });
    });

    it.each([
      ['a MIXED item', () => fx.sauce, { quantity: '1' }, 400, 'MIXED_ITEM_NOT_STOCKED'],
      ['an unknown item', () => randomUUID(), { quantity: '1' }, 404, 'INVENTORY_ITEM_NOT_FOUND'],
      [
        "another tenant's item",
        () => seed.bInventoryItemId,
        { quantity: '1' },
        404,
        'INVENTORY_ITEM_NOT_FOUND',
      ],
      [
        'a unit from another dimension',
        () => fx.beef,
        { quantity: '1', unit: 'L' },
        400,
        'UNIT_DIMENSION_MISMATCH',
      ],
      [
        'a quantity too precise for the stock unit',
        () => fx.beef,
        { quantity: '0.5', unit: 'G' },
        400,
        'QUANTITY_TOO_PRECISE',
      ],
      [
        'a cost too precise per stock unit',
        () => fx.empty,
        { quantity: '1', unit: 'PCS', unitCost: '0.00001' },
        400,
        'VALIDATION_FAILED',
      ],
      ['a zero quantity', () => fx.beef, { quantity: '0' }, 400, 'VALIDATION_FAILED'],
      ['a negative quantity', () => fx.beef, { quantity: '-1' }, 400, 'VALIDATION_FAILED'],
      ['a number instead of a string', () => fx.beef, { quantity: 1 }, 400, 'VALIDATION_FAILED'],
    ] as const)('refuses %s and writes nothing', async (_case, item, body, status, code) => {
      const before = await prisma.inventoryTransaction.count({ where: { tenantId } });
      const res = await http()
        .post(`/v1/${SLUG}/stock/${item()}/restock`)
        .set(as('MANAGER'))
        .send(body)
        .expect(status);
      expect(bodyOf(res)).toMatchObject({ code });
      expect(await prisma.inventoryTransaction.count({ where: { tenantId } })).toBe(before);
    });

    it('refuses a cost that needs more than 4 decimals once converted to the stock unit', async () => {
      const res = await http()
        .post(`/v1/${SLUG}/stock/${fx.cheese}/restock`)
        .set(as('MANAGER'))
        .send({ quantity: '1', unit: 'KG', unitCost: '0.00001' })
        .expect(400);
      expect(bodyOf(res)).toMatchObject({ code: 'VALIDATION_FAILED' });
      const res2 = await http()
        .post(`/v1/${SLUG}/stock/${fx.cheese}/restock`)
        .set(as('MANAGER'))
        .send({ quantity: '1000', unit: 'G', unitCost: '99999999' })
        .expect(400);
      expect(bodyOf(res2)).toMatchObject({ code: 'COST_TOO_LARGE' });
    });
  });

  describe('stock view', () => {
    const list = async (query = ''): Promise<Json[]> =>
      bodyOf(
        await http().get(`/v1/${SLUG}/stock${query}`).set(as('MANAGER')).expect(200),
      ) as Json[];
    const find = (rows: Json[], id: string) => rows.find((r) => r.inventoryItemId === id);

    it('lists every active item with status, current and expected stock', async () => {
      const rows = await list();
      expect(find(rows, fx.empty)).toMatchObject({
        status: 'out-of-stock',
        currentStock: '0.000',
        expectedStock: '0.000',
      });
      for (const row of rows.filter((r) => r.type !== 'MIXED')) {
        expect({ item: row.name, expected: row.expectedStock }).toEqual({
          item: row.name,
          expected: row.currentStock,
        });
      }
      expect(find(rows, seed.bInventoryItemId)).toBeUndefined();
    });

    it('derives a MIXED item from its scarcest component (ADR 0002)', async () => {
      const sauce = find(await list('?type=MIXED'), fx.sauce)!;
      // beef 7.75 / 0.5 = 15.5 L, cheese 3.5 / 0.25 = 14 L → 14 L, limited by cheese.
      expect(sauce).toMatchObject({
        status: 'derived',
        currentStock: null,
        expectedStock: null,
        derivedStock: '14.000',
        limitingItemId: fx.cheese,
      });
      expect(sauce.components).toEqual([
        {
          inventoryItemId: fx.beef,
          name: `Stock Beef ${run}`,
          quantityPerUnit: '0.500',
          unit: 'KG',
        },
        {
          inventoryItemId: fx.cheese,
          name: `Stock Cheese ${run}`,
          quantityPerUnit: '250.000',
          unit: 'G',
        },
      ]);
    });

    it('filters by status', async () => {
      const rows = await list('?status=out-of-stock');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.status === 'out-of-stock')).toBe(true);
    });

    it('expected stock = latest count + ledger since, and the detail shows how', async () => {
      const latest = await prisma.inventoryTransaction.aggregate({
        _max: { seq: true },
        where: { tenantId, inventoryItemId: fx.cheese },
      });
      await prisma.inventorySnapshot.create({
        data: {
          tenantId,
          branchId,
          inventoryItemId: fx.cheese,
          quantity: '3.5',
          throughSeq: latest._max.seq ?? 0n,
        },
      });
      await http()
        .post(`/v1/${SLUG}/stock/${fx.cheese}/restock`)
        .set(as('MANAGER'))
        .send({ quantity: '0.25' })
        .expect(201);
      const res = await http().get(`/v1/${SLUG}/stock/${fx.cheese}`).set(as('MANAGER')).expect(200);
      expect(bodyOf(res)).toMatchObject({
        currentStock: '3.750',
        expectedStock: '3.750',
        lastCountQuantity: '3.500',
        changeSinceLastCount: '0.250',
        lastCountedAt: expect.any(String) as unknown,
      });
    });

    it('answers 404 for an unknown item and refuses WORKER and guests', async () => {
      await http().get(`/v1/${SLUG}/stock/${randomUUID()}`).set(as('MANAGER')).expect(404);
      await http().get(`/v1/${SLUG}/stock`).expect(401);
      await http().get(`/v1/${SLUG}/stock`).set(as('WORKER')).expect(403);
      await http()
        .post(`/v1/${SLUG}/stock/${fx.beef}/restock`)
        .set(as('WORKER'))
        .send({ quantity: '1' })
        .expect(403);
    });
  });

  describe('low-stock list', () => {
    it('lists negative, out-of-stock and low-stock items, worst first', async () => {
      // Push an item below zero through the ledger, as a delivery would (ADR 0006).
      const negative = await stocked('Stock Negative', 'PCS', '1', '1.0000');
      await prisma.$transaction([
        prisma.branchStock.update({
          where: {
            tenantId_branchId_inventoryItemId: { tenantId, branchId, inventoryItemId: negative },
          },
          data: { currentStock: { decrement: '3' } },
        }),
        prisma.inventoryTransaction.create({
          data: {
            tenantId,
            branchId,
            inventoryItemId: negative,
            type: 'WASTE',
            quantityDelta: '-3',
            actorId: managerId,
          },
        }),
      ]);
      const rows = bodyOf(
        await http().get(`/v1/${SLUG}/stock/low`).set(as('MANAGER')).expect(200),
      ) as Json[];
      const statuses = rows.map((r) => r.status);
      expect(new Set(statuses)).toEqual(new Set(['negative', 'out-of-stock', 'low-stock']));
      const rank = { negative: 0, 'out-of-stock': 1, 'low-stock': 2 } as Record<string, number>;
      expect(statuses.map((s) => rank[String(s)])).toEqual(
        [...statuses.map((s) => rank[String(s)])].sort(),
      );
      expect(rows.find((r) => r.inventoryItemId === negative)).toMatchObject({
        status: 'negative',
        currentStock: '-2.000',
      });
      expect(rows.find((r) => r.name === 'Mozzarella')).toMatchObject({ status: 'low-stock' });
      expect(rows.find((r) => r.inventoryItemId === fx.beef)).toBeUndefined();
    });
  });

  describe('customer menu availability (ADR 0021)', () => {
    const menuItem = async () => {
      const res = await http().get(`/v1/${SLUG}/menu`).expect(200);
      return (bodyOf(res) as { items: Json[] }).items.find((i) => i.id === fx.burger);
    };

    it('greys out an item without enough stock for one serving, and brings it back after a restock', async () => {
      // "short" has 2 pieces (restocked above); use them up first, through the ledger.
      await prisma.$transaction([
        prisma.branchStock.update({
          where: {
            tenantId_branchId_inventoryItemId: { tenantId, branchId, inventoryItemId: fx.short },
          },
          data: { currentStock: { decrement: '2' } },
        }),
        prisma.inventoryTransaction.create({
          data: {
            tenantId,
            branchId,
            inventoryItemId: fx.short,
            type: 'WASTE',
            quantityDelta: '-2',
            actorId: managerId,
          },
        }),
      ]);
      expect(await menuItem()).toMatchObject({ available: false });
      await http()
        .post(`/v1/${SLUG}/stock/${fx.short}/restock`)
        .set(as('MANAGER'))
        .send({ quantity: '1' })
        .expect(201);
      expect(await menuItem()).toMatchObject({ available: true });
    });

    it('marks the seeded menu available or not, but always lists it', async () => {
      const res = await http().get(`/v1/${SLUG}/menu`).expect(200);
      const items = (bodyOf(res) as { items: Json[] }).items;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => typeof i.available === 'boolean')).toBe(true);
    });
  });
});
