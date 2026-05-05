import { Injectable } from '@angular/core';
import { DUMMY_CATEGORIES, DUMMY_ITEMS } from '../../DummyData/item';
import { Observable, of } from 'rxjs';
import { MenuFilter, MenuItem } from '../../models';

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  private items = DUMMY_ITEMS;
  private categories = DUMMY_CATEGORIES;
  private activeFilter: MenuFilter = { category: '' };

  getCategories(): Observable<string[]> {
    return of(this.categories);
  }

  getItems(filter?: MenuFilter): Observable<MenuItem[]> {
    return of(this.items.filter(item =>
      (!filter?.category || filter.category === 'all' || item.category === filter.category) &&
      (!filter?.search || item.name.toLowerCase().includes(filter.search?.trim().toLowerCase())) &&
      (filter?.isAvailable === undefined || item.isAvailable === filter.isAvailable)));
  }

  getActiveFilterItems(): Observable<MenuItem[]> {
    return this.getItems(this.activeFilter);
  }

  setActiveFilter(filter: MenuFilter) {
    this.activeFilter = { ...this.activeFilter, ...filter };
  }

  get selectedCategory() {
    return this.activeFilter.category;
  }


}
