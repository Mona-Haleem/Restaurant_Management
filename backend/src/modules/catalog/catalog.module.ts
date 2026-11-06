import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import {
  CategoriesController,
  CustomerMenuController,
  MenuItemsController,
} from './catalog.controller';
import { CatalogService } from './catalog.service';

/** B601: menu, categories and recipes. The customer menu's availability comes from stock (B702). */
@Module({
  imports: [InventoryModule],
  controllers: [CustomerMenuController, CategoriesController, MenuItemsController],
  providers: [CatalogService],
})
export class CatalogModule {}
