import { CurrencyPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CartItem } from '../../../../../core/models';
import { SummeryItemsPipe } from '../../../../../shared/pipes/summery-items/summery-items.pipe';
import { CartService } from '../../../../../core/services/cart/cart.service';

@Component({
  selector: 'app-order-summery-item',
  imports: [MatIconModule, CurrencyPipe, SummeryItemsPipe],
  templateUrl: './order-summery-item.html',
  styleUrl: './order-summery-item.scss',
})
export class OrderSummeryItem {
  private cartService = inject(CartService);

  item = input.required<CartItem>();
  view = input<'default' | 'readonly'>('default');

  /** Completely remove this item from the cart (all quantities). */
  removeItem() {
    this.cartService.removeItem(this.item()._id);
  }

  /** Increment quantity by 1. */
  addToCart() {
    this.cartService.addToCart(this.item());
  }

  /** Decrement quantity by 1 (removes item if quantity reaches 0). */
  removeFromCart() {
    this.cartService.removeFromCart(this.item()._id);
  }
}
