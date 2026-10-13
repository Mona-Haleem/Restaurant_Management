import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './shared/components/layout/header/header';
import { NavLink } from './shared/components/layout/nav-bar/nav-bar';
import { BottomTabs } from './shared/components/layout/bottom-tabs/bottom-tabs';
import { MatIcon } from '@angular/material/icon';
import { SideBar } from './shared/components/layout/side-bar/side-bar';
import { ManagerHeader } from './shared/components/layout/manager-header/manager-header';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, BottomTabs, MatIcon, SideBar, ManagerHeader],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  fill = new Array(250).fill(1);
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
