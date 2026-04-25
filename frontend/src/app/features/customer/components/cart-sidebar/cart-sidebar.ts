import { Component, inject } from '@angular/core';
import { CartService } from '../../../../core/services/cart/cart.service';
import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { MenuItem } from '../../../../core/models';
import { map } from 'rxjs';

@Component({
  selector: 'app-cart-sidebar',
  imports: [AsyncPipe, CurrencyPipe],
  templateUrl: './cart-sidebar.html',
  styleUrl: './cart-sidebar.scss',
})
export class CartSidebar {
  private cartService = inject(CartService);
  serviceFee = 10;
  tax = 10;
  discount = 10;

  cartItems$ = this.cartService.cartItems$;
  total = this.cartService.total;
  count = this.cartService.count;

  get totalpayment() {
    return this.total.pipe(map((total) => total + this.serviceFee + this.tax - this.discount));
  }

  removeFromCart(id: string) {
    this.cartService.removeFromCart(id);
    this.total = this.cartService.total;
    this.count = this.cartService.count;
  }

  addToCart(item: MenuItem) {
    this.cartService.addToCart(item);
    this.total = this.cartService.total;
    this.count = this.cartService.count;
  }
  clearCart() {
    this.cartService.clearCart();

  }
}
