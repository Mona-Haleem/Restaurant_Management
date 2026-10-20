import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Header } from './header';
import { LanguageService } from '../../../../core/services/language/language.service';
import { ThemeService } from '../../../../core/services/theme/theme.service';

@Component({ selector: 'app-dummy-home', standalone: true, template: '<div>Home Page</div>' })
class DummyHomeComponent {}

@Component({ selector: 'app-dummy-menu', standalone: true, template: '<div>Menu Page</div>' })
class DummyMenuComponent {}

const mockTranslations = {
  navigation: {
    menu: 'Menu',
    orders: 'Orders',
    mainNav: 'Main navigation',
    home: 'Home',
    logoAlt: 'Restaurant logo',
    cart: 'Cart',
    cartWithCount: 'Shopping cart with {{count}} items',
    cartBadge: '{{count}} items in cart',
    language: 'Language',
    toggleLanguage: 'Switch language',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode',
    logout: 'Log Out',
    actions: 'Actions',
  },
};

async function setupHeader(isMobile = false, count = 0) {
  const user = userEvent.setup();
  const renderResult = await render(Header, {
    componentInputs: {
      isMobile,
      count,
    },
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en: mockTranslations },
        translocoConfig: {
          availableLangs: ['en'],
          defaultLang: 'en',
          reRenderOnLangChange: true,
        },
        preloadLangs: true,
      }),
    ],
    providers: [
      LanguageService,
      ThemeService,
      provideRouter([
        { path: '', component: DummyHomeComponent },
        { path: 'menu', component: DummyMenuComponent },
      ]),
    ],
  });

  const languageService = TestBed.inject(LanguageService);
  const themeService = TestBed.inject(ThemeService);

  renderResult.fixture.detectChanges();

  return { user, renderResult, languageService, themeService };
}

describe('Header — user experience, accessibility and actions', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('dir', 'ltr');
  });

  it('renders a semantic banner landmark with accessible logo link', async () => {
    await setupHeader();

    const banner = screen.getByRole('banner');
    expect(banner).toBeTruthy();

    const logoImg = screen.getByRole('img', { name: /restaurant logo/i });
    expect(logoImg).toBeTruthy();
  });

  describe('desktop view', () => {
    it('renders navigation links and action buttons toolbar', async () => {
      await setupHeader(false, 3);

      expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Menu' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Orders' })).toBeTruthy();

      expect(screen.getByRole('toolbar', { name: /actions/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /shopping cart with 3 items/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /switch language/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /log out/i })).toBeTruthy();
      expect(screen.getByText('3 items in cart')).toBeTruthy();
    });

    it('toggles language when language button is clicked', async () => {
      const { user, languageService, renderResult } = await setupHeader();

      const initialLang = languageService.language();
      const langBtn = screen.getByRole('button', { name: /switch language/i });

      await user.click(langBtn);
      renderResult.fixture.detectChanges();
      expect(languageService.language()).toBe(initialLang === 'en' ? 'ar' : 'en');
    });

    it('toggles theme when theme button is clicked', async () => {
      const { user, themeService, renderResult } = await setupHeader();

      const initialTheme = themeService.theme();
      const themeBtn = screen.getByRole('button', {
        name: initialTheme === 'dark' ? /switch to light mode/i : /switch to dark mode/i,
      });

      await user.click(themeBtn);
      renderResult.fixture.detectChanges();
      expect(themeService.theme()).toBe(initialTheme === 'dark' ? 'light' : 'dark');
    });
  });

  describe('mobile view', () => {
    it('renders avatar trigger for mobile dropdown menu instead of desktop toolbar', async () => {
      await setupHeader(true);

      // Main navigation links are hidden in mobile view
      expect(screen.queryByRole('navigation', { name: /main navigation/i })).toBeNull();

      // Mobile dropdown trigger is rendered
      const avatarBtn = screen.getByRole('button', {
        name: /account menu/i,
        hidden: true,
      });
      expect(avatarBtn).toBeTruthy();
      expect(screen.getByText('M')).toBeTruthy();
    });
  });
});
