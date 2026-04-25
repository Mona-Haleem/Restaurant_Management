import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MenuCard } from '../menu-card/menu-card';
import { MenuItem } from '../../../../core/models';

@Component({
  selector: 'app-menu-grid',
  imports: [MenuCard],
  templateUrl: './menu-grid.html',
  styleUrl: './menu-grid.scss',
})
export class MenuGrid {
  // items = DUMMY_ITEMS;
  @Input() items: MenuItem[] = [];
}
