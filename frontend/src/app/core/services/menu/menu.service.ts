import { Injectable } from '@angular/core';
import { DUMMY_CATEGORIES, DUMMY_ITEMS } from '../../DummyData/item';
import { BehaviorSubject, map, Observable, of } from 'rxjs';
import { MenuFilter, MenuItem } from '../../models';


@Injectable({
  providedIn: 'root',
})
export class MenuService {
  private items = DUMMY_ITEMS;
  private categories = DUMMY_CATEGORIES;

  private activeFilterSubject = new BehaviorSubject<MenuFilter>({ category: '' });
  activeFilter$ = this.activeFilterSubject.asObservable();

  getCategories(): Observable<string[]> {
    return of(this.categories);
  }

  private getItems(filter?: MenuFilter): MenuItem[] {
    return this.items.filter(item =>
      (!filter?.category || filter.category === 'all' || item.category === filter.category) &&
      (!filter?.search || item.name.toLowerCase().includes(filter.search.trim().toLowerCase())) &&
      (filter?.isAvailable === undefined || item.isAvailable === filter.isAvailable)
    );
  }

  getActiveFilterItems(): Observable<MenuItem[]> {
    return this.activeFilter$.pipe(
      map(filter => this.getItems(filter))
    );
  }

  setActiveFilter(filter: MenuFilter) {
    const current = this.activeFilterSubject.value;
    this.activeFilterSubject.next({ ...current, ...filter });
  }

  get selectedCategory() {
    return this.activeFilterSubject.value.category;
  }
}