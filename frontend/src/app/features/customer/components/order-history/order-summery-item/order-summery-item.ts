import { CurrencyPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CartItem } from '../../../../../core/models';
import { SummeryItemsPipe } from '../../../../../shared/pipes/summery-items/summery-items.pipe';

@Component({
  selector: 'app-order-summery-item',
  imports: [MatIconModule, CurrencyPipe, SummeryItemsPipe],
  templateUrl: './order-summery-item.html',
  styleUrl: './order-summery-item.scss',
})
export class OrderSummeryItem {
  @Input({ required: true }) item!: CartItem;
  @Input() view?: 'default' | 'readonly' = 'default';
  removeItem() {

  }

  addToCart() {

  }
  removeFromCart() {

  }
}
