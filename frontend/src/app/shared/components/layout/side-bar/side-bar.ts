import { Component, input, computed, inject } from '@angular/core';
import { NavLink } from '../nav-bar/nav-bar';
import { MatIcon } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService } from '../../../../core/services/theme/theme.service';
import { LanguageService } from '../../../../core/services/language/language.service';

@Component({
  selector: 'app-side-bar',
  imports: [MatIcon, RouterLink, RouterLinkActive],
  templateUrl: './side-bar.html',
  styleUrl: './side-bar.scss',
})
export class SideBar {
  themeService = inject(ThemeService);
  languageService = inject(LanguageService);
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
}
