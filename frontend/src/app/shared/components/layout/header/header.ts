import { Component, computed, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DropdownItem, DropdownMenu } from '../../overlays/dropdown-menu/dropdown-menu';
import { ThemeService } from '../../../../core/services/theme/theme.service';
import { NavBar, NavLink } from '../nav-bar/nav-bar';
import { LanguageService } from '../../../../core/services/language/language.service';

@Component({
  selector: 'app-header, header[app-header]',
  imports: [DropdownMenu, NavBar, MatIcon, TranslocoPipe],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  host: {
    role: 'banner',
  },
})
export class Header {
  isMobile = input<boolean>(false);
  count = input<number>(0);
  themeService = inject(ThemeService);
  languageService = inject(LanguageService);
  private transloco = inject(TranslocoService);

  themeIcon = computed(() => (this.themeService.theme() === 'light' ? 'light_mode' : 'dark_mode'));
  logoImg = computed(
    () => `logo_${this.themeService.theme()}_${this.languageService.language()}.png`,
  );

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

  actions = computed<DropdownItem[]>(() => {
    // Read reactive signals so computed re-evaluates
    this.languageService.language();
    const currentTheme = this.themeService.theme();

    return [
      {
        id: 'cart',
        label: this.transloco.translate('navigation.cart'),
        icon: 'shopping_cart',
      },
      {
        id: 'language',
        label: this.transloco.translate('navigation.language'),
        icon: 'translate',
      },
      {
        id: 'theme',
        label:
          currentTheme === 'dark'
            ? this.transloco.translate('navigation.themeLight')
            : this.transloco.translate('navigation.themeDark'),
        icon: this.themeIcon(),
      },
      {
        id: 'logout',
        label: this.transloco.translate('navigation.logout'),
        icon: 'logout',
        danger: true,
      },
    ];
  });

  mobileActions = computed(() => this.actions().slice(1));

  getActionAriaLabel(item: DropdownItem): string {
    switch (item.id) {
      case 'cart':
        return this.count() > 0
          ? this.transloco.translate('navigation.cartWithCount', { count: this.count() })
          : this.transloco.translate('navigation.cart');
      case 'language':
        return this.transloco.translate('navigation.toggleLanguage');
      case 'theme':
        return this.themeService.theme() === 'dark'
          ? this.transloco.translate('navigation.switchToLight')
          : this.transloco.translate('navigation.switchToDark');
      case 'logout':
        return this.transloco.translate('navigation.logout');
      default:
        return item.label;
    }
  }

  handleClick(item: DropdownItem) {
    switch (item.id) {
      case 'language':
        this.languageService.toggleLanguage();
        break;
      case 'theme':
        this.themeService.toggleTheme();
        break;
    }
  }
}
