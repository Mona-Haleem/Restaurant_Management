import { DOCUMENT } from '@angular/common';
import { inject, Injectable, LOCALE_ID, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type Language = 'en' | 'ar';

@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  private readonly document = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly transloco = inject(TranslocoService);
  private readonly storageKey = 'language';

  readonly language = signal<Language>(this.getInitialLanguage());

  constructor() {
    this.applyLanguage(this.language());
  }

  setLanguage(language: Language): void {
    this.language.set(language);
    this.applyLanguage(language);
    localStorage.setItem(this.storageKey, language);
  }

  toggleLanguage(): void {
    this.setLanguage(this.language() === 'en' ? 'ar' : 'en');
  }

  private getInitialLanguage(): Language {
    const saved = localStorage.getItem(this.storageKey) as Language | null;
    if (saved === 'en' || saved === 'ar') {
      return saved;
    }

    // Fall back to Angular's LOCALE_ID if it starts with 'ar'
    if (this.localeId.startsWith('ar')) {
      return 'ar';
    }

    return 'en';
  }

  private applyLanguage(language: Language): void {
    const root = this.document.documentElement;
    root.setAttribute('lang', language);
    root.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    this.transloco.setActiveLang(language);
  }
}
