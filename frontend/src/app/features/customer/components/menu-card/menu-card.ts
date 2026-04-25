import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MenuItem } from '../../../../core/models';
import { CurrencyPipe } from '@angular/common';
@Component({
  selector: 'app-menu-card',
  standalone: true,
  imports: [MatIconModule, CurrencyPipe],
  templateUrl: './menu-card.html',
  styleUrl: './menu-card.scss',
})
export class MenuCard {
  @Input({ required: true }) item!: MenuItem;
  @Output() addToCart = new EventEmitter<MenuItem>();
  // item = input<MenuItem>();
  onAddToCart() {
    this.addToCart.emit(this.item);
  }
}
