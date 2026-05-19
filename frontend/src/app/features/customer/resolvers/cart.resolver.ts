import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { CartService, OrderSummaryData } from '../../../core/services/cart/cart.service';
import { CartItem } from '../../../core/models';
import { forkJoin, Observable, take } from 'rxjs';

export interface CartResolvedData {
  items: CartItem[];
  summary: OrderSummaryData;
}

export const cartResolver: ResolveFn<CartResolvedData> = (route, state): Observable<CartResolvedData> => {
  const cartService = inject(CartService);
  return forkJoin({
    items: cartService.cartItems$.pipe(take(1)),
    summary: cartService.getCartSummary().pipe(take(1))
  });
};
