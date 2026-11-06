import { AppException } from '../../common/errors/app-exception';
import { RequestContextStore } from '../../context/request-context.store';
import type { RequestContext } from '../../context/request-context';
import type { TenantDb } from '../../prisma/tenant-prisma';
import { CatalogService } from './catalog.service';

// Unit tests for the service's own decisions (error mapping, defaults, menu filter). The real
// queries, tenant scoping and Postgres behaviour are proven in test/catalog.e2e-spec.ts and
// test/tenant-isolation.e2e-spec.ts; this fake only records what the service asks for.

const CTX: RequestContext = {
  tenantId: 'tenant-a',
  tenantSlug: 'nile-bites',
  tenantName: 'Nile Bites',
  isDemoTenant: true,
  branchId: 'branch-1',
  actor: { id: 'u', name: 'Salma', role: 'MANAGER' },
};

const decimal = (v: string) => ({ toFixed: (scale: number) => Number(v).toFixed(scale) });
const ITEM = {
  id: 'item-1',
  categoryId: 'cat-1',
  branchId: null,
  name: 'Burger',
  description: null,
  price: decimal('185'),
  status: 'ACTIVE',
  updatedAt: new Date('2026-11-06T10:00:00Z'),
};

function fakeDb() {
  const db = {
    category: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 4 } }),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'cat-new', isActive: true, ...args.data }),
      ),
      findUnique: jest.fn().mockResolvedValue({ id: 'cat-1' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }),
      update: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'x', position: 1, isActive: true }),
    },
    menuItem: {
      findMany: jest.fn().mockResolvedValue([ITEM]),
      findUnique: jest.fn().mockResolvedValue(ITEM),
      create: jest.fn().mockResolvedValue({ id: 'item-1' }),
      update: jest.fn().mockResolvedValue(ITEM),
    },
    menuItemIngredient: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
    branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return db;
}

/** The first argument of a mock's first call. */
function firstArg(fn: jest.Mock): unknown {
  return (fn.mock.calls[0] as unknown[])[0];
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
  return 'OK';
}

describe('CatalogService', () => {
  let db: ReturnType<typeof fakeDb>;
  let service: CatalogService;
  const store = new RequestContextStore();
  const inContext = <T>(fn: () => Promise<T>, ctx: RequestContext = CTX): Promise<T> =>
    store.run(ctx, async () => await fn());

  beforeEach(() => {
    db = fakeDb();
    service = new CatalogService(db as unknown as TenantDb, store);
  });

  describe('customer menu', () => {
    it('asks for active items in active categories, for the branch or every branch', async () => {
      const menu = await inContext(() => service.getCustomerMenu({ search: 'burg' }));
      const where = (firstArg(db.menuItem.findMany) as { where: Record<string, unknown> }).where;
      expect(where).toEqual({
        status: 'ACTIVE',
        category: { isActive: true },
        OR: [{ branchId: null }, { branchId: 'branch-1' }],
        name: { contains: 'burg', mode: 'insensitive' },
      });
      expect(menu.items[0]).toMatchObject({ id: 'item-1', price: '185.00' });
      expect(firstArg(db.category.findMany)).toMatchObject({
        where: { id: { in: ['cat-1'] } },
      });
    });

    it('shows only all-branch items when the caller has no branch', async () => {
      await inContext(() => service.getCustomerMenu({ categoryId: 'cat-1' }), {
        ...CTX,
        branchId: null,
      });
      const where = (firstArg(db.menuItem.findMany) as { where: Record<string, unknown> }).where;
      expect(where).toMatchObject({ OR: [{ branchId: null }], categoryId: 'cat-1' });
    });
  });

  describe('categories', () => {
    it('puts a new category after the last one, writing the context tenant', async () => {
      const created = await inContext(() => service.createCategory({ name: 'Desserts' }));
      expect(firstArg(db.category.create)).toMatchObject({
        data: { tenantId: 'tenant-a', name: 'Desserts', position: 5 },
      });
      expect(created).toMatchObject({ name: 'Desserts', position: 5 });
    });

    it('starts at position 1 for the first category, and keeps an explicit position', async () => {
      db.category.aggregate.mockResolvedValue({ _max: { position: null } });
      await inContext(() => service.createCategory({ name: 'First' }));
      await inContext(() => service.createCategory({ name: 'Fixed', position: 7 }));
      expect(
        db.category.create.mock.calls.map(
          (c) => (c[0] as { data: { position: number } }).data.position,
        ),
      ).toEqual([1, 7]);
    });

    it('maps a duplicate name to 409 CATEGORY_NAME_TAKEN on create and update', async () => {
      db.category.create.mockRejectedValue({ code: 'P2002' });
      db.category.update.mockRejectedValue({ code: 'P2002' });
      expect(await failure(inContext(() => service.createCategory({ name: 'Dup' })))).toBe(
        '409 CATEGORY_NAME_TAKEN',
      );
      expect(await failure(inContext(() => service.updateCategory('cat-1', { name: 'Dup' })))).toBe(
        '409 CATEGORY_NAME_TAKEN',
      );
    });

    it('lets other database errors through untouched', async () => {
      const boom = new Error('connection lost');
      db.category.create.mockRejectedValue(boom);
      await expect(inContext(() => service.createCategory({ name: 'X' }))).rejects.toBe(boom);
    });

    it('answers 404 CATEGORY_NOT_FOUND when updating an unknown category', async () => {
      db.category.findUnique.mockResolvedValue(null);
      expect(
        await failure(inContext(() => service.updateCategory('nope', { isActive: false }))),
      ).toBe('404 CATEGORY_NOT_FOUND');
    });

    it('lists categories in display order', async () => {
      await inContext(() => service.listCategories());
      expect(firstArg(db.category.findMany)).toMatchObject({
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      });
    });
  });

  describe('menu items', () => {
    const dto = { categoryId: 'cat-1', name: 'Burger', price: '185' };

    it('refuses an inactive or unknown category, and an unknown branch', async () => {
      db.category.findFirst.mockResolvedValueOnce(null);
      expect(await failure(inContext(() => service.createMenuItem(dto)))).toBe(
        '400 CATEGORY_NOT_FOUND',
      );
      db.branch.findFirst.mockResolvedValueOnce(null);
      expect(
        await failure(inContext(() => service.createMenuItem({ ...dto, branchId: 'b-x' }))),
      ).toBe('400 BRANCH_NOT_FOUND');
      expect(db.menuItem.create).not.toHaveBeenCalled();
    });

    it('refuses an invalid recipe with every issue listed, before writing anything', async () => {
      const ingredients = [{ inventoryItemId: 'ghost', quantity: '1', unit: 'KG' as const }];
      try {
        await inContext(() => service.createMenuItem({ ...dto, ingredients }));
        throw new Error('expected a failure');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).details).toEqual({
          issues: [{ index: 0, code: 'INVENTORY_ITEM_NOT_FOUND', inventoryItemId: 'ghost' }],
        });
      }
      expect(db.menuItem.create).not.toHaveBeenCalled();
    });

    it('creates the item for the context tenant, then its recipe as a separate write', async () => {
      db.inventoryItem.findMany.mockResolvedValue([{ id: 'beef', unit: 'KG', isActive: true }]);
      await inContext(() =>
        service.createMenuItem({
          ...dto,
          ingredients: [{ inventoryItemId: 'beef', quantity: '150', unit: 'G' }],
        }),
      );
      expect(firstArg(db.menuItem.create)).toMatchObject({
        data: { tenantId: 'tenant-a', branchId: null, description: null, price: '185' },
      });
      expect(firstArg(db.menuItemIngredient.createMany)).toEqual({
        data: [
          {
            tenantId: 'tenant-a',
            menuItemId: 'item-1',
            inventoryItemId: 'beef',
            quantity: '150',
            unit: 'G',
          },
        ],
      });
    });

    it('replaces the recipe only when ingredients are sent', async () => {
      await inContext(() => service.updateMenuItem('item-1', { name: 'Renamed' }));
      expect(db.menuItemIngredient.deleteMany).not.toHaveBeenCalled();
      await inContext(() => service.updateMenuItem('item-1', { ingredients: [] }));
      expect(db.menuItemIngredient.deleteMany).toHaveBeenCalledWith({
        where: { menuItemId: 'item-1' },
      });
      expect(db.menuItemIngredient.createMany).not.toHaveBeenCalled();
    });

    it('checks a new category and branch on update', async () => {
      db.category.findFirst.mockResolvedValueOnce(null);
      expect(
        await failure(inContext(() => service.updateMenuItem('item-1', { categoryId: 'old' }))),
      ).toBe('400 CATEGORY_NOT_FOUND');
      db.branch.findFirst.mockResolvedValueOnce(null);
      expect(
        await failure(inContext(() => service.updateMenuItem('item-1', { branchId: 'b-x' }))),
      ).toBe('400 BRANCH_NOT_FOUND');
    });

    it('answers 404 MENU_ITEM_NOT_FOUND for an unknown item on read, edit and archive', async () => {
      db.menuItem.findUnique.mockResolvedValue(null);
      expect(await failure(inContext(() => service.getMenuItem('nope')))).toBe(
        '404 MENU_ITEM_NOT_FOUND',
      );
      expect(await failure(inContext(() => service.updateMenuItem('nope', {})))).toBe(
        '404 MENU_ITEM_NOT_FOUND',
      );
      expect(await failure(inContext(() => service.setMenuItemStatus('nope', 'ARCHIVED')))).toBe(
        '404 MENU_ITEM_NOT_FOUND',
      );
      expect(db.menuItem.update).not.toHaveBeenCalled();
    });

    it('archives by status, never by delete', async () => {
      await inContext(() => service.setMenuItemStatus('item-1', 'ARCHIVED'));
      expect(db.menuItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { status: 'ARCHIVED' },
      });
    });

    it('filters the staff list by status, category and name', async () => {
      const rows = await inContext(() =>
        service.listMenuItems({ status: 'ARCHIVED', categoryId: 'cat-1', search: 'bur' }),
      );
      expect(firstArg(db.menuItem.findMany)).toMatchObject({
        where: {
          status: 'ARCHIVED',
          categoryId: 'cat-1',
          name: { contains: 'bur', mode: 'insensitive' },
        },
      });
      expect(rows[0]).toMatchObject({ price: '185.00', updatedAt: '2026-11-06T10:00:00.000Z' });
    });

    it('formats recipe quantities with three decimals', async () => {
      db.menuItemIngredient.findMany.mockResolvedValue([
        {
          inventoryItemId: 'beef',
          quantity: decimal('150'),
          unit: 'G',
          inventoryItem: { name: 'Beef Mince' },
        },
      ]);
      const item = await inContext(() => service.getMenuItem('item-1'));
      expect(item.ingredients).toEqual([
        {
          inventoryItemId: 'beef',
          inventoryItemName: 'Beef Mince',
          quantity: '150.000',
          unit: 'G',
        },
      ]);
    });
  });
});
