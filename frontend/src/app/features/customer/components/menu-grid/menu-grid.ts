import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MenuCard } from '../menu-card/menu-card';
import { DUMMY_ITEMS } from '../../../../core/DummyData/item';
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
  @Output() addToCart = new EventEmitter<MenuItem>();
  onAddToCart(item: MenuItem) {
    this.addToCart.emit(item);
    console.log(item);
  }
}
