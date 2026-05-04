import { Component, Input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { type CartItem } from '../../../../../core/models';
import { CartService } from '../../../../../core/services/cart/cart.service';

@Component({
  selector: 'app-cart-item',
  imports: [CurrencyPipe],
  templateUrl: './cart-item.html',
  styleUrl: './cart-item.scss',
})
export class CartItemComponent {
  @Input({ required: true }) item!: CartItem

  constructor(private cartService: CartService) { }

  addToCart() {
    this.cartService.addToCart(this.item);
  }

  removeFromCart() {
    this.cartService.removeFromCart(this.item._id);
  }
}
