import { Injectable } from '@angular/core';
import { DUMMY_CATEGORIES, DUMMY_ITEMS } from '../../DummyData/item';
import { Observable, of } from 'rxjs';
import { MenuItem } from '../../models';

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  private items = DUMMY_ITEMS;
  categories = DUMMY_CATEGORIES;

  getCategories(): Observable<string[]> {
    return of(this.categories);
  }

  getItems(filter?: string): Observable<MenuItem[]> {
    if (!filter || filter === 'all') {
      return of(this.items);
    }
    return of(this.items.filter(item => item.category === filter));
  }


}
