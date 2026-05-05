import { Component } from '@angular/core';
import { MenuGrid } from '../../components/menu-grid/menu-grid';
import { CategoryFilter } from '../../components/category-filter/category-filter';
import { CartSidebar } from '../../components/cart-sidebar/cart-sidebar';
import { SearchBar } from '../../components/search-bar/search-bar';

@Component({
  selector: 'app-menu-page',
  imports: [MenuGrid, CategoryFilter, CartSidebar, SearchBar],
  templateUrl: './menu.page.html',
  styleUrl: './menu.page.scss',
})
export class MenuPage {

}
