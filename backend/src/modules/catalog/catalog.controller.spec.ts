import {
  CategoriesController,
  CustomerMenuController,
  MenuItemsController,
} from './catalog.controller';
import type { CatalogService } from './catalog.service';

// The controllers are thin: each route hands its input to one service call (CLAUDE.md).

describe('catalog controllers', () => {
  const service = {
    getCustomerMenu: jest.fn().mockResolvedValue('menu'),
    listCategories: jest.fn().mockResolvedValue('categories'),
    createCategory: jest.fn().mockResolvedValue('created category'),
    updateCategory: jest.fn().mockResolvedValue('updated category'),
    listMenuItems: jest.fn().mockResolvedValue('items'),
    getMenuItem: jest.fn().mockResolvedValue('item'),
    createMenuItem: jest.fn().mockResolvedValue('created item'),
    updateMenuItem: jest.fn().mockResolvedValue('updated item'),
    setMenuItemStatus: jest.fn().mockResolvedValue('status'),
  };
  const catalog = service as unknown as CatalogService;

  it('customer menu', async () => {
    await expect(
      new CustomerMenuController(catalog).getCustomerMenu({ search: 'x' }),
    ).resolves.toBe('menu');
    expect(service.getCustomerMenu).toHaveBeenCalledWith({ search: 'x' });
  });

  it('categories', async () => {
    const c = new CategoriesController(catalog);
    await expect(c.listCategories()).resolves.toBe('categories');
    await expect(c.createCategory({ name: 'A' })).resolves.toBe('created category');
    await expect(c.updateCategory('id', { isActive: false })).resolves.toBe('updated category');
    expect(service.createCategory).toHaveBeenCalledWith({ name: 'A' });
    expect(service.updateCategory).toHaveBeenCalledWith('id', { isActive: false });
  });

  it('menu items', async () => {
    const c = new MenuItemsController(catalog);
    const dto = { categoryId: 'c', name: 'n', price: '1' };
    await expect(c.listMenuItems({ status: 'ACTIVE' })).resolves.toBe('items');
    await expect(c.getMenuItem('id')).resolves.toBe('item');
    await expect(c.createMenuItem(dto)).resolves.toBe('created item');
    await expect(c.updateMenuItem('id', { name: 'm' })).resolves.toBe('updated item');
    await c.archiveMenuItem('id');
    await c.restoreMenuItem('id');
    expect(service.setMenuItemStatus.mock.calls).toEqual([
      ['id', 'ARCHIVED'],
      ['id', 'ACTIVE'],
    ]);
    expect(service.createMenuItem).toHaveBeenCalledWith(dto);
  });
});
