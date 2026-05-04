import { Component, inject } from '@angular/core';
import { CartService } from '../../../../core/services/cart/cart.service';
import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { map } from 'rxjs';
import { CartItemComponent } from './cart-item/cart-item';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-cart-sidebar',
  imports: [AsyncPipe, CartItemComponent, CurrencyPipe, MatIconModule],
  templateUrl: './cart-sidebar.html',
  styleUrl: './cart-sidebar.scss',
})
export class CartSidebar {
  private cartService = inject(CartService);
  serviceFee = 10;
  tax = 10;
  discount = 10;

  cartItems$ = this.cartService.cartItems$;

  get total() {
    return this.cartService.total;
  }
  get count() {
    return this.cartService.count;
  }

  get totalpayment() {
    return this.total.pipe(map((total) => total + this.serviceFee + this.tax - this.discount));
  }

  clearCart() {
    this.cartService.clearCart();

  }
}
