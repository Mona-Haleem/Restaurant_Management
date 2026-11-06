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

// B601 acceptance on real Postgres: archiving removes an item from the customer menu at once;
// a nonexistent or negative ingredient is rejected. Plus the rest of the catalog rules.

const SLUG = 'nile-bites';
type Json = Record<string, unknown>;
type MenuBody = { categories: { id: string }[]; items: { id: string; price: string }[] };

describe('catalog (B601)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let seed: SeedTenants;
  let burgers: string;
  let beef: string;
  let buns: string;
  const http = () => request(app.getHttpServer());
  const as = (role: string) => ({ 'x-dev-role': role });
  const unique = (name: string) =>
    `${name} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const menuIds = async (query = ''): Promise<string[]> => {
    const res = await http().get(`/v1/${SLUG}/menu${query}`).expect(200);
    return (bodyOf(res) as MenuBody).items.map((i) => i.id);
  };
  const createItem = async (overrides: Json = {}, role = 'MANAGER'): Promise<Json> => {
    const res = await http()
      .post(`/v1/${SLUG}/menu-items`)
      .set(as(role))
      .send({
        categoryId: burgers,
        name: unique('Test Burger'),
        description: 'For the tests',
        price: '99.5',
        ingredients: [
          { inventoryItemId: beef, quantity: '150', unit: 'G' },
          { inventoryItemId: buns, quantity: '1', unit: 'PCS' },
        ],
        ...overrides,
      })
      .expect(201);
    return bodyOf(res) as Json;
  };

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = await ensureSeedTenants(prisma);
    const id = (key: string) => seed.a.inventoryItems.find((i) => i.name === key)!.id;
    burgers = seed.a.categories.find((c) => c.name === 'Burgers')!.id;
    beef = id('Beef Mince');
    buns = id('Brioche Buns');
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

  describe('acceptance', () => {
    it('archiving removes an item from the customer menu immediately', async () => {
      const item = await createItem();
      expect(await menuIds()).toContain(item.id);

      const archived = await http()
        .post(`/v1/${SLUG}/menu-items/${String(item.id)}/archive`)
        .set(as('MANAGER'))
        .expect(200);
      expect(bodyOf(archived)).toMatchObject({ id: item.id, status: 'ARCHIVED' });
      expect(await menuIds()).not.toContain(item.id);

      await http()
        .post(`/v1/${SLUG}/menu-items/${String(item.id)}/restore`)
        .set(as('MANAGER'))
        .expect(200);
      expect(await menuIds()).toContain(item.id);
    });

    it('rejects an item with a nonexistent ingredient, and writes nothing', async () => {
      const before = await prisma.menuItem.count({ where: { tenantId: seed.a.tenant.id } });
      const missing = '00000000-0000-4000-8000-000000000000';
      const res = await http()
        .post(`/v1/${SLUG}/menu-items`)
        .set(as('MANAGER'))
        .send({
          categoryId: burgers,
          name: unique('Ghost'),
          price: '10',
          ingredients: [{ inventoryItemId: missing, quantity: '1', unit: 'KG' }],
        })
        .expect(400);
      expect(bodyOf(res)).toMatchObject({
        code: 'INVALID_RECIPE',
        details: {
          issues: [{ index: 0, code: 'INVENTORY_ITEM_NOT_FOUND', inventoryItemId: missing }],
        },
      });
      expect(await prisma.menuItem.count({ where: { tenantId: seed.a.tenant.id } })).toBe(before);
    });

    it.each(['-1', '0', '-0.5', 'abc', ''])('rejects ingredient quantity %j', async (quantity) => {
      const res = await http()
        .post(`/v1/${SLUG}/menu-items`)
        .set(as('MANAGER'))
        .send({
          categoryId: burgers,
          name: unique('Negative'),
          price: '10',
          ingredients: [{ inventoryItemId: beef, quantity, unit: 'KG' }],
        })
        .expect(400);
      expect(bodyOf(res)).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('menu items', () => {
    it('returns decimals as strings with the column scale (ADR 0013)', async () => {
      const item = await createItem({ price: '99.5' });
      expect(item).toMatchObject({
        price: '99.50',
        status: 'ACTIVE',
        categoryId: burgers,
        branchId: null,
        ingredients: [
          {
            inventoryItemId: beef,
            inventoryItemName: 'Beef Mince',
            quantity: '150.000',
            unit: 'G',
          },
          {
            inventoryItemId: buns,
            inventoryItemName: 'Brioche Buns',
            quantity: '1.000',
            unit: 'PCS',
          },
        ],
      });
    });

    it('edits fields and replaces the whole recipe', async () => {
      const item = await createItem();
      const res = await http()
        .patch(`/v1/${SLUG}/menu-items/${String(item.id)}`)
        .set(as('ADMIN'))
        .send({
          price: '120',
          ingredients: [{ inventoryItemId: beef, quantity: '0.2', unit: 'KG' }],
        })
        .expect(200);
      expect(bodyOf(res)).toMatchObject({
        price: '120.00',
        ingredients: [{ inventoryItemId: beef, quantity: '0.200', unit: 'KG' }],
      });
      const rows = await prisma.menuItemIngredient.count({
        where: { menuItemId: String(item.id) },
      });
      expect(rows).toBe(1);
    });

    it('keeps the recipe when the edit leaves ingredients out', async () => {
      const item = await createItem();
      const res = await http()
        .patch(`/v1/${SLUG}/menu-items/${String(item.id)}`)
        .set(as('MANAGER'))
        .send({ name: unique('Renamed') })
        .expect(200);
      expect((bodyOf(res) as { ingredients: unknown[] }).ingredients).toHaveLength(2);
    });

    it.each([
      [
        'a unit from another dimension',
        { inventoryItemId: 'BUNS', quantity: '10', unit: 'G' },
        'UNIT_DIMENSION_MISMATCH',
      ],
      [
        'a quantity too precise for the stock unit',
        { inventoryItemId: 'BEEF', quantity: '0.5', unit: 'G' },
        'INGREDIENT_QUANTITY_TOO_PRECISE',
      ],
    ])('rejects %s', async (_case, line, code) => {
      const inventoryItemId = line.inventoryItemId === 'BUNS' ? buns : beef;
      const res = await http()
        .post(`/v1/${SLUG}/menu-items`)
        .set(as('MANAGER'))
        .send({
          categoryId: burgers,
          name: unique('Bad'),
          price: '10',
          ingredients: [{ ...line, inventoryItemId }],
        })
        .expect(400);
      expect(bodyOf(res)).toMatchObject({
        code: 'INVALID_RECIPE',
        details: { issues: [{ code }] },
      });
    });

    it('rejects a duplicate ingredient', async () => {
      const res = await http()
        .post(`/v1/${SLUG}/menu-items`)
        .set(as('MANAGER'))
        .send({
          categoryId: burgers,
          name: unique('Twice'),
          price: '10',
          ingredients: [
            { inventoryItemId: beef, quantity: '100', unit: 'G' },
            { inventoryItemId: beef, quantity: '0.1', unit: 'KG' },
          ],
        })
        .expect(400);
      expect(bodyOf(res)).toMatchObject({
        details: { issues: [{ index: 1, code: 'DUPLICATE_INGREDIENT' }] },
      });
    });

    it('rejects a price with more than 2 decimals, a negative price and unknown fields', async () => {
      for (const body of [
        { price: '1.005' },
        { price: '-1' },
        { price: 10 },
        { tenantId: seed.b.tenant.id },
        { isCombo: true },
      ]) {
        const res = await http()
          .post(`/v1/${SLUG}/menu-items`)
          .set(as('MANAGER'))
          .send({ categoryId: burgers, name: unique('Bad'), price: '1', ingredients: [], ...body })
          .expect(400);
        expect(bodyOf(res)).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
    });

    it('allows a free item (price 0) and an item with no recipe', async () => {
      expect(await createItem({ price: '0', ingredients: [] })).toMatchObject({
        price: '0.00',
        ingredients: [],
      });
    });

    it('scopes an item to a branch of the tenant only', async () => {
      const branchId = seed.a.branches[0]!.id;
      const item = await createItem({ branchId });
      expect(item.branchId).toBe(branchId);
      expect(await menuIds()).toContain(item.id);
      const res = await http()
        .post(`/v1/${SLUG}/menu-items`)
        .set(as('MANAGER'))
        .send({
          categoryId: burgers,
          name: unique('Elsewhere'),
          price: '1',
          branchId: seed.b.branches[0]!.id,
        })
        .expect(400);
      expect(bodyOf(res)).toMatchObject({ code: 'BRANCH_NOT_FOUND' });
    });

    it('lists and filters menu items for staff, archived ones included on request', async () => {
      const item = await createItem();
      await http()
        .post(`/v1/${SLUG}/menu-items/${String(item.id)}/archive`)
        .set(as('MANAGER'))
        .expect(200);
      const archived = await http()
        .get(`/v1/${SLUG}/menu-items?status=ARCHIVED`)
        .set(as('MANAGER'))
        .expect(200);
      const rows = bodyOf(archived) as { id: string; status: string }[];
      expect(rows.map((r) => r.id)).toContain(item.id);
      expect(rows.every((r) => r.status === 'ARCHIVED')).toBe(true);
      const all = await http().get(`/v1/${SLUG}/menu-items`).set(as('MANAGER')).expect(200);
      expect((bodyOf(all) as unknown[]).length).toBeGreaterThan(rows.length);
    });

    it('answers 404 MENU_ITEM_NOT_FOUND for an unknown id and 400 for a malformed one', async () => {
      const res = await http()
        .get(`/v1/${SLUG}/menu-items/00000000-0000-4000-8000-000000000000`)
        .set(as('MANAGER'))
        .expect(404);
      expect(bodyOf(res)).toMatchObject({ code: 'MENU_ITEM_NOT_FOUND' });
      await http().get(`/v1/${SLUG}/menu-items/not-a-uuid`).set(as('MANAGER')).expect(400);
    });
  });

  describe('PATCH input (null and blank values are 400, never 500)', () => {
    it.each([{ name: null }, { price: null }, { categoryId: null }, { name: '   ' }])(
      'refuses menu item %j',
      async (body) => {
        const item = await createItem();
        const res = await http()
          .patch(`/v1/${SLUG}/menu-items/${String(item.id)}`)
          .set(as('MANAGER'))
          .send(body)
          .expect(400);
        expect(bodyOf(res)).toMatchObject({ code: 'VALIDATION_FAILED' });
      },
    );

    it.each([{ name: null }, { position: null }, { isActive: null }, { name: ' ' }])(
      'refuses category %j',
      async (body) => {
        const res = await http()
          .patch(`/v1/${SLUG}/categories/${burgers}`)
          .set(as('MANAGER'))
          .send(body)
          .expect(400);
        expect(bodyOf(res)).toMatchObject({ code: 'VALIDATION_FAILED' });
      },
    );

    it('clears a description with null, sells an item everywhere with branchId null, and trims names', async () => {
      const padded = unique('Padded');
      const item = await createItem({ branchId: seed.a.branches[0]!.id, name: `  ${padded}  ` });
      expect(item.name).toBe(padded);
      const res = await http()
        .patch(`/v1/${SLUG}/menu-items/${String(item.id)}`)
        .set(as('MANAGER'))
        .send({ description: null, branchId: null })
        .expect(200);
      expect(bodyOf(res)).toMatchObject({ description: null, branchId: null });
    });

    it('treats a padded duplicate category name as taken', async () => {
      const name = unique('Grills');
      await http().post(`/v1/${SLUG}/categories`).set(as('MANAGER')).send({ name }).expect(201);
      await http()
        .post(`/v1/${SLUG}/categories`)
        .set(as('MANAGER'))
        .send({ name: ` ${name} ` })
        .expect(409);
    });

    it('accepts an edit that resends the current (now archived) category', async () => {
      const created = await http()
        .post(`/v1/${SLUG}/categories`)
        .set(as('MANAGER'))
        .send({ name: unique('Old') })
        .expect(201);
      const categoryId = (bodyOf(created) as { id: string }).id;
      const item = await createItem({ categoryId });
      await http()
        .patch(`/v1/${SLUG}/categories/${categoryId}`)
        .set(as('MANAGER'))
        .send({ isActive: false })
        .expect(200);
      await http()
        .patch(`/v1/${SLUG}/menu-items/${String(item.id)}`)
        .set(as('MANAGER'))
        .send({ categoryId, price: '42' })
        .expect(200);
    });
  });

  describe('categories', () => {
    it('creates, renames and refuses a duplicate name', async () => {
      const name = unique('Desserts');
      const created = await http()
        .post(`/v1/${SLUG}/categories`)
        .set(as('MANAGER'))
        .send({ name })
        .expect(201);
      const category = bodyOf(created) as { id: string; position: number; isActive: boolean };
      expect(category).toMatchObject({ name, isActive: true });
      expect(category.position).toBeGreaterThan(0);
      const dup = await http()
        .post(`/v1/${SLUG}/categories`)
        .set(as('MANAGER'))
        .send({ name })
        .expect(409);
      expect(bodyOf(dup)).toMatchObject({ code: 'CATEGORY_NAME_TAKEN' });
      const renamed = await http()
        .patch(`/v1/${SLUG}/categories/${category.id}`)
        .set(as('ADMIN'))
        .send({ name: `${name} & Sweets`, position: 9 })
        .expect(200);
      expect(bodyOf(renamed)).toMatchObject({ name: `${name} & Sweets`, position: 9 });
    });

    it('hides the items of an archived category, and shows them again when it is back', async () => {
      const created = await http()
        .post(`/v1/${SLUG}/categories`)
        .set(as('MANAGER'))
        .send({ name: unique('Seasonal') })
        .expect(201);
      const categoryId = (bodyOf(created) as { id: string }).id;
      const item = await createItem({ categoryId });
      expect(await menuIds()).toContain(item.id);

      await http()
        .patch(`/v1/${SLUG}/categories/${categoryId}`)
        .set(as('MANAGER'))
        .send({ isActive: false })
        .expect(200);
      expect(await menuIds()).not.toContain(item.id);
      const kept = await http()
        .get(`/v1/${SLUG}/menu-items/${String(item.id)}`)
        .set(as('MANAGER'))
        .expect(200);
      expect(bodyOf(kept)).toMatchObject({ status: 'ACTIVE' });
      const menu = await http().get(`/v1/${SLUG}/menu`).expect(200);
      expect((bodyOf(menu) as MenuBody).categories.map((c) => c.id)).not.toContain(categoryId);

      const refused = await http()
        .post(`/v1/${SLUG}/menu-items`)
        .set(as('MANAGER'))
        .send({ categoryId, name: unique('Into archived'), price: '1' })
        .expect(400);
      expect(bodyOf(refused)).toMatchObject({ code: 'CATEGORY_NOT_FOUND' });

      await http()
        .patch(`/v1/${SLUG}/categories/${categoryId}`)
        .set(as('MANAGER'))
        .send({ isActive: true })
        .expect(200);
      expect(await menuIds()).toContain(item.id);
    });
  });

  describe('customer menu', () => {
    it('is public, lists categories with visible items, and filters by search and category', async () => {
      const name = unique('Zucchini Fritters');
      const item = await createItem({ name });
      const res = await http().get(`/v1/${SLUG}/menu`).expect(200);
      const menu = bodyOf(res) as MenuBody & { items: { name: string; categoryId: string }[] };
      expect(menu.categories.map((c) => c.id)).toContain(burgers);
      expect(menu.items.find((i) => i.id === item.id)).toMatchObject({
        price: '99.50',
        categoryId: burgers,
      });

      expect(await menuIds(`?search=${encodeURIComponent('zucchini fritters')}`)).toContain(
        item.id,
      );
      expect(await menuIds('?search=no-such-dish-anywhere')).toEqual([]);
      const pizza = seed.a.categories.find((c) => c.name === 'Pizza')!.id;
      expect(await menuIds(`?categoryId=${pizza}`)).not.toContain(item.id);
    });

    it('never lists the seeded archived item', async () => {
      const archived = seed.a.menuItems.find((m) => m.status === 'ARCHIVED')!.id;
      expect(await menuIds()).not.toContain(archived);
    });
  });

  describe('roles (ADR 0019: ADMIN and MANAGER manage the menu)', () => {
    it.each([
      ['GET', '/menu-items'],
      ['POST', '/categories'],
      ['POST', '/menu-items'],
      ['PATCH', '/menu-items/00000000-0000-4000-8000-000000000000'],
      ['POST', '/menu-items/00000000-0000-4000-8000-000000000000/archive'],
      ['PATCH', '/categories/00000000-0000-4000-8000-000000000000'],
    ])('refuses a guest and a WORKER on %s %s', async (method, path) => {
      const call = () =>
        method === 'GET'
          ? http().get(`/v1/${SLUG}${path}`)
          : method === 'PATCH'
            ? http().patch(`/v1/${SLUG}${path}`).send({})
            : http().post(`/v1/${SLUG}${path}`).send({});
      await call().expect(401);
      await call().set(as('WORKER')).expect(403);
    });
  });
});
