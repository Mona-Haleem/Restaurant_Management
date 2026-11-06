import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { formatDecimal, MONEY, QUANTITY } from '../../common/decimal/decimal';
import { RequestContextStore } from '../../context/request-context.store';
import { TENANT_DB, type TenantDb } from '../../prisma/tenant-prisma';
import type { CategoryDto, CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import type {
  CreateMenuItemDto,
  CustomerMenuDto,
  CustomerMenuQueryDto,
  IngredientInputDto,
  ListMenuItemsQueryDto,
  MenuItemDto,
  MenuItemSummaryDto,
  UpdateMenuItemDto,
} from './dto/menu-item.dto';
import { validateRecipe } from './recipe';

/** Prisma's interactive-transaction client for the tenant-scoped client. */
type Tx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0];

const CATEGORY_FIELDS = { id: true, name: true, position: true, isActive: true } as const;
const ITEM_FIELDS = {
  id: true,
  categoryId: true,
  branchId: true,
  name: true,
  description: true,
  price: true,
  status: true,
  updatedAt: true,
} as const;

type ItemRow = Prisma.MenuItemGetPayload<{ select: typeof ITEM_FIELDS }>;

function toSummary(row: ItemRow): MenuItemSummaryDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    branchId: row.branchId,
    name: row.name,
    description: row.description,
    price: formatDecimal(row.price, MONEY),
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

/**
 * Menu, categories and recipes (B601). Every query goes through the tenant-scoped client, so ids
 * from another restaurant simply do not exist here (404 / 400), never leak.
 */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantDb,
    private readonly context: RequestContextStore,
  ) {}

  private get tenantId(): string {
    return this.context.require().tenantId;
  }

  // ── Customer menu ───────────────────────────────────────────────────────────────────────
  /**
   * What a guest may order: ACTIVE items in active categories, sold in the caller's branch or in
   * every branch (ADR 0004). Archived items and archived categories never appear (ADR 0019).
   */
  async getCustomerMenu(query: CustomerMenuQueryDto): Promise<CustomerMenuDto> {
    const { branchId } = this.context.require();
    const items = await this.db.menuItem.findMany({
      where: {
        status: 'ACTIVE',
        category: { isActive: true },
        OR: branchId ? [{ branchId: null }, { branchId }] : [{ branchId: null }],
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ category: { position: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
      select: { id: true, categoryId: true, name: true, description: true, price: true },
    });
    const categoryIds = [...new Set(items.map((i) => i.categoryId))];
    const categories = await this.db.category.findMany({
      where: { id: { in: categoryIds } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, position: true },
    });
    return {
      categories,
      items: items.map((i) => ({ ...i, price: formatDecimal(i.price, MONEY) })),
    };
  }

  // ── Categories ──────────────────────────────────────────────────────────────────────────
  listCategories(): Promise<CategoryDto[]> {
    return this.db.category.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: CATEGORY_FIELDS,
    });
  }

  async createCategory(dto: CreateCategoryDto): Promise<CategoryDto> {
    const position =
      dto.position ??
      ((await this.db.category.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1;
    try {
      return await this.db.category.create({
        data: { tenantId: this.tenantId, name: dto.name, position },
        select: CATEGORY_FIELDS,
      });
    } catch (error) {
      throw this.categoryNameTaken(error, dto.name);
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    const existing = await this.db.category.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new AppException(404, 'CATEGORY_NOT_FOUND', 'No such category.', { id });
    try {
      return await this.db.category.update({
        where: { id },
        data: { name: dto.name, position: dto.position, isActive: dto.isActive },
        select: CATEGORY_FIELDS,
      });
    } catch (error) {
      throw this.categoryNameTaken(error, dto.name);
    }
  }

  private categoryNameTaken(error: unknown, name: string | undefined): unknown {
    return isUniqueViolation(error)
      ? new AppException(409, 'CATEGORY_NAME_TAKEN', 'A category with this name already exists.', {
          name,
        })
      : error;
  }

  // ── Menu items ──────────────────────────────────────────────────────────────────────────
  async listMenuItems(query: ListMenuItemsQueryDto): Promise<MenuItemSummaryDto[]> {
    const rows = await this.db.menuItem.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: ITEM_FIELDS,
    });
    return rows.map(toSummary);
  }

  getMenuItem(id: string): Promise<MenuItemDto> {
    return this.readMenuItem(this.db, id);
  }

  createMenuItem(dto: CreateMenuItemDto): Promise<MenuItemDto> {
    return this.db.$transaction(async (tx) => {
      await this.assertCategory(tx, dto.categoryId);
      if (dto.branchId) await this.assertBranch(tx, dto.branchId);
      const ingredients = dto.ingredients ?? [];
      await this.assertRecipe(tx, ingredients);
      const tenantId = this.tenantId;
      const item = await tx.menuItem.create({
        data: {
          tenantId,
          categoryId: dto.categoryId,
          branchId: dto.branchId ?? null,
          name: dto.name,
          description: dto.description ?? null,
          price: dto.price,
        },
        select: { id: true },
      });
      await this.writeRecipe(tx, item.id, ingredients);
      return this.readMenuItem(tx, item.id);
    });
  }

  updateMenuItem(id: string, dto: UpdateMenuItemDto): Promise<MenuItemDto> {
    return this.db.$transaction(async (tx) => {
      const current = await this.assertMenuItem(tx, id);
      // Resending the item's current category is fine even if that category is archived now.
      if (dto.categoryId !== undefined && dto.categoryId !== current.categoryId) {
        await this.assertCategory(tx, dto.categoryId);
      }
      if (dto.branchId) await this.assertBranch(tx, dto.branchId);
      if (dto.ingredients) await this.assertRecipe(tx, dto.ingredients);
      await tx.menuItem.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          branchId: dto.branchId,
          name: dto.name,
          description: dto.description,
          price: dto.price,
        },
      });
      if (dto.ingredients) {
        // Recipe lines are configuration, so a new recipe replaces the old one (ADR 0019).
        await tx.menuItemIngredient.deleteMany({ where: { menuItemId: id } });
        await this.writeRecipe(tx, id, dto.ingredients);
      }
      return this.readMenuItem(tx, id);
    });
  }

  /** Archive or restore (no hard delete, rule 5). Idempotent. */
  setMenuItemStatus(id: string, status: 'ACTIVE' | 'ARCHIVED'): Promise<MenuItemDto> {
    return this.db.$transaction(async (tx) => {
      await this.assertMenuItem(tx, id);
      await tx.menuItem.update({ where: { id }, data: { status } });
      return this.readMenuItem(tx, id);
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────────────────
  private async readMenuItem(db: Tx | TenantDb, id: string): Promise<MenuItemDto> {
    const row = await db.menuItem.findUnique({ where: { id }, select: ITEM_FIELDS });
    if (!row) throw new AppException(404, 'MENU_ITEM_NOT_FOUND', 'No such menu item.', { id });
    const lines = await db.menuItemIngredient.findMany({
      where: { menuItemId: id },
      // Lines written together share created_at, so sort by name for a stable order.
      orderBy: [{ inventoryItem: { name: 'asc' } }, { id: 'asc' }],
      select: {
        inventoryItemId: true,
        quantity: true,
        unit: true,
        inventoryItem: { select: { name: true } },
      },
    });
    return {
      ...toSummary(row),
      ingredients: lines.map((l) => ({
        inventoryItemId: l.inventoryItemId,
        inventoryItemName: l.inventoryItem.name,
        quantity: formatDecimal(l.quantity, QUANTITY),
        unit: l.unit,
      })),
    };
  }

  private async assertMenuItem(tx: Tx, id: string): Promise<{ categoryId: string }> {
    const row = await tx.menuItem.findUnique({ where: { id }, select: { categoryId: true } });
    if (!row) throw new AppException(404, 'MENU_ITEM_NOT_FOUND', 'No such menu item.', { id });
    return row;
  }

  private async assertCategory(tx: Tx, id: string): Promise<void> {
    const row = await tx.category.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
    if (!row) {
      throw new AppException(400, 'CATEGORY_NOT_FOUND', 'No active category with that id.', {
        categoryId: id,
      });
    }
  }

  private async assertBranch(tx: Tx, id: string): Promise<void> {
    const row = await tx.branch.findFirst({ where: { id, isActive: true }, select: { id: true } });
    if (!row) {
      throw new AppException(400, 'BRANCH_NOT_FOUND', 'No active branch with that id.', {
        branchId: id,
      });
    }
  }

  private async assertRecipe(tx: Tx, lines: IngredientInputDto[]): Promise<void> {
    const items = await tx.inventoryItem.findMany({
      where: { id: { in: lines.map((l) => l.inventoryItemId) } },
      select: { id: true, unit: true, isActive: true },
    });
    const issues = validateRecipe(lines, new Map(items.map((i) => [i.id, i])));
    if (issues.length > 0) {
      throw new AppException(400, 'INVALID_RECIPE', 'Some ingredient rows are not valid.', {
        issues,
      });
    }
  }

  private async writeRecipe(
    tx: Tx,
    menuItemId: string,
    lines: IngredientInputDto[],
  ): Promise<void> {
    if (lines.length === 0) return;
    const tenantId = this.tenantId;
    // Its own scoped query, not a nested write (ADR 0018). Quantities stay in the entered unit.
    await tx.menuItemIngredient.createMany({
      data: lines.map((l) => ({
        tenantId,
        menuItemId,
        inventoryItemId: l.inventoryItemId,
        quantity: l.quantity,
        unit: l.unit,
      })),
    });
  }
}
