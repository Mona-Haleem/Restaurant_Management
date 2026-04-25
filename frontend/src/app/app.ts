import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuGrid } from './features/customer/components/menu-grid/menu-grid';
import { DUMMY_ITEMS, DUMMY_CATEGORIES } from './core/DummyData/item';
import { CategoryFilter } from './features/customer/components/category-filter/category-filter';
import { CartSidebar } from './features/customer/components/cart-sidebar/cart-sidebar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MenuGrid, CategoryFilter, CartSidebar],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('frontend');
  items = DUMMY_ITEMS;
  categories = DUMMY_CATEGORIES;
  activeCategory = '';

  onCategorySelected(category: string) {
    this.activeCategory = category;
  }

  get filteredItems() {
    if (!this.activeCategory) {
      return this.items;
    }
    return this.items.filter(item => item.category === this.activeCategory);
  }

}
