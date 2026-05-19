import { Component, inject } from '@angular/core';
import { MenuGrid } from '../../components/menu/menu-grid/menu-grid';
import { CategoryFilter } from '../../components/menu/category-filter/category-filter';
import { CartSidebar } from '../../components/menu/cart-sidebar/cart-sidebar';
import { MenuService } from '../../../../core/services/menu/menu.service';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-menu-page',
  imports: [MenuGrid, CategoryFilter, CartSidebar, AsyncPipe],
  templateUrl: './menu.page.html',
  styleUrl: './menu.page.scss',
})
export class MenuPage {
  private menuService = inject(MenuService);

  items$ = this.menuService.getActiveFilterItems();
  categories$ = this.menuService.getCategories();
}
