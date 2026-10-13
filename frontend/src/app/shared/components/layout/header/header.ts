import { Component, computed, inject } from '@angular/core';
import { DropdownItem, DropdownMenu } from '../../overlays/dropdown-menu/dropdown-menu';
import { ThemeService } from '../../../../core/services/theme/theme.service';
import { NavBar, NavLink } from '../nav-bar/nav-bar';
import { MatIcon } from '@angular/material/icon';
import { LanguageService } from '../../../../core/services/language/language.service';

@Component({
  selector: 'app-header',
  imports: [DropdownMenu, NavBar, MatIcon],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  themeService = inject(ThemeService);
  languageService = inject(LanguageService);
  themeIcon = computed(() => (this.themeService.theme() === 'light' ? 'light_mode' : 'dark_mode'));
  logoImg = computed(
    () => `logo_${this.themeService.theme()}_${this.languageService.language()}.png`,
  );
  navLinks: NavLink[] = [
    {
      label: 'menu',
      route: '/menu',
    },
    {
      label: 'orders',
      route: '/orders',
    },
  ];
  actions: DropdownItem[] = [
    {
      id: 'cart',
      label: 'cart',
      icon: 'shopping_cart',
    },
    {
      id: 'language',
      label: 'language',
      icon: 'translate',
    },
    {
      id: 'theme',
      label: 'theme',
      icon: this.themeIcon(),
    },
    {
      id: 'logout',
      label: 'logout',
      icon: 'logout',
      danger: true,
    },
  ];
  count = 0;

  handleClick(item: DropdownItem) {
    console.log(this.languageService.language(), this.themeService.theme());

    console.log(item);
    switch (item.id) {
      // case 'cart':
      //   this.router.navigate(['/cart']);
      //   break;
      case 'language':
        this.languageService.toggleLanguage();
        break;
      case 'theme':
        this.themeService.toggleTheme();
        break;
      // case 'logout':
      //   this.authService.logout();
      //   break;
    }
  }
}
