import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowGuest, Roles, TenantRoute } from '../../context/access.decorators';
import { CatalogService } from './catalog.service';
import { CategoryDto, CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import {
  CreateMenuItemDto,
  CustomerMenuDto,
  CustomerMenuQueryDto,
  ListMenuItemsQueryDto,
  MenuItemDto,
  MenuItemSummaryDto,
  UpdateMenuItemDto,
} from './dto/menu-item.dto';

/** The public menu (PRD §8.1). Guests welcome. */
@ApiTags('menu')
@TenantRoute()
@Controller(':tenantSlug/menu')
export class CustomerMenuController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @AllowGuest()
  @ApiOperation({
    summary: 'The customer menu',
    description:
      'Active items in active categories, for the caller’s branch. Archived items never appear.',
  })
  @ApiOkResponse({ type: CustomerMenuDto })
  getCustomerMenu(@Query() query: CustomerMenuQueryDto): Promise<CustomerMenuDto> {
    return this.catalog.getCustomerMenu(query);
  }
}

/** Menu Manager: categories (ADMIN and MANAGER, ADR 0019). */
@ApiTags('categories')
@TenantRoute()
@Roles('MANAGER')
@Controller(':tenantSlug/categories')
export class CategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'All categories, archived ones included' })
  @ApiOkResponse({ type: [CategoryDto] })
  listCategories(): Promise<CategoryDto[]> {
    return this.catalog.listCategories();
  }

  @Post()
  @ApiOperation({ summary: 'Create a category (409 CATEGORY_NAME_TAKEN for a duplicate name)' })
  @ApiCreatedResponse({ type: CategoryDto })
  createCategory(@Body() dto: CreateCategoryDto): Promise<CategoryDto> {
    return this.catalog.createCategory(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename, reorder, archive or restore a category',
    description:
      'Archiving hides its items from the customer menu; the items keep their own status.',
  })
  @ApiOkResponse({ type: CategoryDto })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.catalog.updateCategory(id, dto);
  }
}

/** Menu Manager: menu items and their recipes (ADMIN and MANAGER, ADR 0019). */
@ApiTags('menu-items')
@TenantRoute()
@Roles('MANAGER')
@Controller(':tenantSlug/menu-items')
export class MenuItemsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Menu items, archived ones included unless filtered' })
  @ApiOkResponse({ type: [MenuItemSummaryDto] })
  listMenuItems(@Query() query: ListMenuItemsQueryDto): Promise<MenuItemSummaryDto[]> {
    return this.catalog.listMenuItems(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One menu item with its recipe' })
  @ApiOkResponse({ type: MenuItemDto })
  getMenuItem(@Param('id', ParseUUIDPipe) id: string): Promise<MenuItemDto> {
    return this.catalog.getMenuItem(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a menu item with its recipe',
    description: '400 INVALID_RECIPE lists every bad ingredient row in `details.issues`.',
  })
  @ApiCreatedResponse({ type: MenuItemDto })
  createMenuItem(@Body() dto: CreateMenuItemDto): Promise<MenuItemDto> {
    return this.catalog.createMenuItem(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a menu item; `ingredients` replaces the whole recipe' })
  @ApiOkResponse({ type: MenuItemDto })
  updateMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<MenuItemDto> {
    return this.catalog.updateMenuItem(id, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive a menu item (it leaves the customer menu at once)' })
  @ApiOkResponse({ type: MenuItemDto })
  archiveMenuItem(@Param('id', ParseUUIDPipe) id: string): Promise<MenuItemDto> {
    return this.catalog.setMenuItemStatus(id, 'ARCHIVED');
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bring an archived menu item back' })
  @ApiOkResponse({ type: MenuItemDto })
  restoreMenuItem(@Param('id', ParseUUIDPipe) id: string): Promise<MenuItemDto> {
    return this.catalog.setMenuItemStatus(id, 'ACTIVE');
  }
}
