import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { Header } from '../../../../shared/components/layout/header/header';
import { BottomTabs } from '../../../../shared/components/layout/bottom-tabs/bottom-tabs';
import { NavLink } from '../../../../shared/components/layout/nav-bar/nav-bar';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, Header, BottomTabs, MatIcon, TranslocoPipe],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
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
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 640px)').pipe(map((state) => state.matches)),
    { initialValue: this.breakpointObserver.isMatched('(max-width: 640px)') },
  );
}
