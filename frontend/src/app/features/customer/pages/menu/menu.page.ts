import { Component, inject } from '@angular/core';
import { MenuGrid } from '../../components/menu/menu-grid/menu-grid';
import { CategoryFilter } from '../../components/menu/category-filter/category-filter';
import { CartSidebar } from '../../components/menu/cart-sidebar/cart-sidebar';
import { MenuService } from '../../../../core/services/menu/menu.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-menu-page',
  imports: [MenuGrid, CategoryFilter, CartSidebar],
  templateUrl: './menu.page.html',
  styleUrl: './menu.page.scss',
})
export class MenuPage {
  private menuService = inject(MenuService);

  items = this.menuService.filteredItems;
  categories = this.menuService.getCategories();
}
