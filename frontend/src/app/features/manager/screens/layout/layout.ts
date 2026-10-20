import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { NavLink } from '../../../../shared/components/layout/nav-bar/nav-bar';
import { BottomTabs } from '../../../../shared/components/layout/bottom-tabs/bottom-tabs';
import { SideBar } from '../../../../shared/components/layout/side-bar/side-bar';
import { ManagerHeader } from '../../../../shared/components/layout/manager-header/manager-header';
import { ThemeService } from '../../../../core/services/theme/theme.service';
import { LanguageService } from '../../../../core/services/language/language.service';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, BottomTabs, MatIcon, SideBar, ManagerHeader, TranslocoPipe],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);
  readonly languageService = inject(LanguageService);

  readonly currentRouteData = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => {
        const data: Record<string, unknown> = {};
        let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;

        while (route) {
          Object.assign(data, route.data);
          route = route.firstChild;
        }

        return data;
      }),
    ),
    { initialValue: {} as Record<string, unknown> },
  );

  headerTitle = computed(() => (this.currentRouteData()['headerTitle'] as string) || 'dashboard');

  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 640px)').pipe(map((state) => state.matches)),
    { initialValue: this.breakpointObserver.isMatched('(max-width: 640px)') },
  );

  readonly isTablet = toSignal(
    this.breakpointObserver.observe('(max-width: 1024px)').pipe(map((state) => state.matches)),
    { initialValue: this.breakpointObserver.isMatched('(max-width: 1024px)') },
  );

  navLinks: NavLink[] = [
    {
      label: 'dashboard',
      route: '/manager/dashboard',
      icon: 'grid_view',
    },
    {
      label: 'menu manager',
      route: '/manager/menu',
      icon: 'menu_book_2',
    },
    {
      label: 'inventory',
      route: '/manager/inventory',
      icon: 'package_2',
    },
    {
      label: 'reports & waste',
      route: '/manager/reports',
      icon: 'fork_chart',
    },
    {
      label: 'staff directory',
      route: '/manager/staff',
      icon: 'group',
    },
  ];
}
