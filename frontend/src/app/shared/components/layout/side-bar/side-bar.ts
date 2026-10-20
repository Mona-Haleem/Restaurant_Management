import { Component, input, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NavLink } from '../nav-bar/nav-bar';
import { ThemeService } from '../../../../core/services/theme/theme.service';
import { LanguageService } from '../../../../core/services/language/language.service';
import { isActive } from '../../../helpers/route_check';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-side-bar',
  imports: [MatIcon, RouterLink, TranslocoPipe],
  templateUrl: './side-bar.html',
  styleUrl: './side-bar.scss',
  host: {
    role: 'complementary',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class SideBar {
  isMobile = input<boolean>();
  isTablet = input<boolean>();
  themeService = inject(ThemeService);
  languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService, { optional: true });

  ariaLabel = toSignal(this.transloco!.selectTranslate('navigation.sideNav'), {
    initialValue: 'Side navigation',
  });

  themeIcon = computed(() => (this.themeService.theme() === 'light' ? 'light_mode' : 'dark_mode'));
  logoImg = computed(
    () => `logo_${this.themeService.theme()}_${this.languageService.language()}.png`,
  );
  links = input.required<NavLink[]>();
  actions = {
    language: {
      id: 'language',
      label: 'EN / AR',
      icon: 'translate',
    },
    theme: {
      id: 'theme',
      label: this.themeService.theme(),
      icon: this.themeIcon(),
    },
    logout: {
      id: 'logout',
      label: 'logout',
      icon: 'logout',
      danger: true,
    },
  };
  router = inject(Router);
  isActive(route: string) {
    return isActive(route, this.router);
  }
}
