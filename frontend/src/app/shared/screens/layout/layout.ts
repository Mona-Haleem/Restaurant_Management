import { Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '../../../core/services/theme/theme.service';
import { LanguageService } from '../../../core/services/language/language.service';

@Component({
  selector: 'app-layout',
  imports: [TranslocoPipe, RouterOutlet],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  private themeService = inject(ThemeService);
  languageService = inject(LanguageService);
  themeIcon = computed(() => (this.themeService.theme() === 'light' ? 'light_mode' : 'dark_mode'));
  logoImg = computed(
    () => `logo_${this.themeService.theme()}_${this.languageService.language()}.png`,
  );
}
