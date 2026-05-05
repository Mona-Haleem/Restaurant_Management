import { Component, inject } from '@angular/core';
import { MenuCard } from './menu-card/menu-card';
import { MenuService } from '../../../../core/services/menu/menu.service';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-menu-grid',
  imports: [MenuCard, AsyncPipe],
  templateUrl: './menu-grid.html',
  styleUrl: './menu-grid.scss',
})
export class MenuGrid {
  private itemsService = inject(MenuService)

  get items() {
    return this.itemsService.getActiveFilterItems();
  }
}
