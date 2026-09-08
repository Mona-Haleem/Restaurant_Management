import { Component, inject } from '@angular/core';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { CurrencyPipe } from '@angular/common';
import { CartItemComponent } from './cart-item/cart-item';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

@Component({
  selector: 'app-cart-sidebar',
  imports: [CartItemComponent, CurrencyPipe, MatIconModule],
  templateUrl: './cart-sidebar.html',
  styleUrl: './cart-sidebar.scss',
})
export class CartSidebar {
  private cartService = inject(CartService);
  private router = inject(Router);

  cartItems = this.cartService.cartItems;
  count = this.cartService.cartCount;
  summary = this.cartService.cartSummary;

  clearCart() {
    this.cartService.clearCart();
  }

  /** Navigate to checkout — the order is placed at the END of the checkout flow, not here. */
  checkout() {
    this.router.navigate(['customer', 'checkout']);
  }
}
