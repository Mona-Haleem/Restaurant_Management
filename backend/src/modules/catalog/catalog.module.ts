import { Module } from '@nestjs/common';
import {
  CategoriesController,
  CustomerMenuController,
  MenuItemsController,
} from './catalog.controller';
import { CatalogService } from './catalog.service';

/** B601: menu, categories and recipes. */
@Module({
  controllers: [CustomerMenuController, CategoriesController, MenuItemsController],
  providers: [CatalogService],
})
export class CatalogModule {}
