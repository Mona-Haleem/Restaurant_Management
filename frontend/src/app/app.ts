import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './shared/components/layout/header/header';
import { NavLink } from './shared/components/layout/nav-bar/nav-bar';
import { BottomTabs } from './shared/components/layout/bottom-tabs/bottom-tabs';
import { MatIcon } from '@angular/material/icon';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, BottomTabs, MatIcon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('frontend');
  navLinks: NavLink[] = [
    {
      label: 'menu',
      route: '/menu',
      icon: 'menu_book_2',
    },
    {
      label: 'orders',
      route: '/orders',
      icon: 'receipt',
    },
  ];
  count = 2;
}
