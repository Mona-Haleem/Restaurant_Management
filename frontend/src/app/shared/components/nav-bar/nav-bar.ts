import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SearchBar } from '../../../features/customer/components/search-bar/search-bar';
import { CartService } from '../../../core/services/cart/cart.service';
import { AsyncPipe } from '@angular/common';
import { map } from 'rxjs';
import { RouterLink, RouterLinkActive } from '@angular/router';
//temporary has to be updated and tested.

@Component({
  selector: 'app-nav-bar',
  imports: [MatIconModule, SearchBar, AsyncPipe, RouterLink, RouterLinkActive],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
})
export class NavBar {
  private cartService = inject(CartService)

  get count() {
    return this.cartService.count.pipe(map(c => c > 9 ? '9+' : c == 0 ? '' : c));
  }



}
