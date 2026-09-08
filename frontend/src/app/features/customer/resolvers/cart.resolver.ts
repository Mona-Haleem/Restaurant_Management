import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { CartService, OrderSummaryData } from '../../../core/services/cart/cart.service';
import { CartItem } from '../../../core/models';
import { of } from 'rxjs';

export interface CartResolvedData {
  items: CartItem[];
  summary: OrderSummaryData;
}

export const cartResolver: ResolveFn<CartResolvedData> = () => {
  const cartService = inject(CartService);
  return of({
    items: cartService.cartItems(),
    summary: cartService.cartSummary(),
  });
};
