import { Injectable, signal, computed } from '@angular/core';
import { DUMMY_CATEGORIES, DUMMY_ITEMS } from '../../DummyData/item';
import { Observable, of } from 'rxjs';
import { MenuFilter, MenuItem } from '../../models';

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  private items = signal<MenuItem[]>(DUMMY_ITEMS);
  private categories = signal<string[]>(DUMMY_CATEGORIES);

  // ─── State signal ────────────────────────────────────────────────────────
  activeFilter = signal<MenuFilter>({ category: '' });

  // ─── Derived computed signals ─────────────────────────────────────────────
  filteredItems = computed(() => this.getItems(this.activeFilter()));
  selectedCategory = computed(() => this.activeFilter().category);

  getCategories(): string[] {
    return this.categories();
  }

  private getItems(filter?: MenuFilter): MenuItem[] {
    return this.items().filter(
      (item) =>
        (!filter?.category || filter.category === 'all' || item.category === filter.category) &&
        (!filter?.search || item.name.toLowerCase().includes(filter.search.trim().toLowerCase())) &&
        (filter?.isAvailable === undefined || item.isAvailable === filter.isAvailable),
    );
  }

  setActiveFilter(filter: MenuFilter) {
    this.activeFilter.update((current) => ({ ...current, ...filter }));
  }
}
