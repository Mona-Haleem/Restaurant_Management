import { Component, inject, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MenuItem } from '../../../../../core/models';
import { CurrencyPipe } from '@angular/common';
import { CartService } from '../../../../../core/services/cart/cart.service';
@Component({
  selector: 'app-menu-card',
  standalone: true,
  imports: [MatIconModule, CurrencyPipe],
  templateUrl: './menu-card.html',
  styleUrl: './menu-card.scss',
})
export class MenuCard {
  @Input({ required: true }) item!: MenuItem;
  readonly cartService = inject(CartService);

  addToCart() {
    this.cartService.addToCart(this.item);
  }
}
