import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { MenuService } from '../../../core/services/menu/menu.service';
import { forkJoin, Observable, take } from 'rxjs';
import { MenuItem } from '../../../core/models';

export interface MenuResolvedData {
  items: MenuItem[];
  categories: string[];
}

export const menuResolver: ResolveFn<MenuResolvedData> = (route, state): Observable<MenuResolvedData> => {
  const menuService = inject(MenuService);
  return forkJoin({
    items: menuService.getActiveFilterItems().pipe(take(1)),
    categories: menuService.getCategories().pipe(take(1))
  });
};
