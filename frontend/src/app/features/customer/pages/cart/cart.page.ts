import { Component, inject, Input } from '@angular/core';
import { CartService } from '../../../../core/services/cart/cart.service';
import { OrderSummeryItem } from '../../components/order-history/order-summery-item/order-summery-item';
import { AsyncPipe } from '@angular/common';
import { SectionCard } from '../../../../shared/components/section-card/section-card';
import { OrderSummary } from '../../components/order-history/order-summary/order-summary';

import { CartResolvedData } from '../../resolvers/cart.resolver';

@Component({
  selector: 'app-cart.page',
  imports: [OrderSummeryItem, OrderSummary, SectionCard, AsyncPipe],
  templateUrl: './cart.page.html',
  styleUrl: './cart.page.scss',
})
export class CartPage {
  private cartService = inject(CartService);

  @Input() cartData?: CartResolvedData;

  cartItems$ = this.cartService.cartItems$;
  count$ = this.cartService.count;
}
