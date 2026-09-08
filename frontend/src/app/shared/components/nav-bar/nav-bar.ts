import { Component, DestroyRef, HostListener, inject, OnInit, signal } from '@angular/core';
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
export class NavBar implements OnInit {
  private cartService = inject(CartService);
  isMobile = signal(window.innerWidth <= 768);
  isOpen = signal(false);
  private resizeTimeout?: ReturnType<typeof setTimeout>;
  private destroyRef = inject(DestroyRef);
  @HostListener('window:resize')
  onResize() {
    clearTimeout(this.resizeTimeout);

    this.resizeTimeout = setTimeout(() => {
      this.isMobile.set(window.innerWidth <= 768);
    }, 200);
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.resizeTimeout);
    });
  }

  get count() {
    return this.cartService.cartCount;
  }

  onMenuClick() {
    this.isOpen.set(!this.isOpen());
  }
}
