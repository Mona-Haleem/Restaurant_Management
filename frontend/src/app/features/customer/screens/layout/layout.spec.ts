import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, beforeEach } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Layout } from './layout';
import { LanguageService } from '../../../../core/services/language/language.service';
import { ThemeService } from '../../../../core/services/theme/theme.service';

@Component({
  standalone: true,
  template: '<div data-testid="menu-view">Customer Menu Content</div>',
})
class DummyMenuComponent {}

@Component({
  standalone: true,
  template: '<div data-testid="orders-view">Customer Orders Content</div>',
})
class DummyOrdersComponent {}

const enTranslations = {
  navigation: {
    menu: 'Menu',
    orders: 'Orders',
    skipToContent: 'Skip to main content',
    mainNav: 'Main navigation',
    bottomNav: 'Bottom navigation',
    logoAlt: 'Restaurant logo',
    home: 'Home',
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

const arTranslations = {
  navigation: {
    menu: 'قائمة الطعام',
    orders: 'الطلبات',
    skipToContent: 'الانتقال إلى المحتوى الرئيسي',
    mainNav: 'التنقل الرئيسي',
    bottomNav: 'شريط التنقل السفلي',
    logoAlt: 'شعار المطعم',
    home: 'الرئيسية',
    cart: 'عربة التسوق',
    cartWithCount: 'عربة التسوق بها {{count}} عناصر',
    cartBadge: '{{count}} عناصر في السلة',
    language: 'اللغة',
    toggleLanguage: 'تغيير اللغة',
    theme: 'السمة',
    themeLight: 'فاتح',
    themeDark: 'داكن',
    switchToLight: 'التبديل إلى الوضع الفاتح',
    switchToDark: 'التبديل إلى الوضع الداكن',
    logout: 'تسجيل الخروج',
    actions: 'الإجراءات',
  },
};

async function setupCustomerLayout(isMobileMatch = false) {
  const user = userEvent.setup();

  const mockBreakpointObserver = {
    isMatched: (query: string) => (query.includes('640px') ? isMobileMatch : false),
    observe: (query: string) =>
      of({
        matches: query.includes('640px') ? isMobileMatch : false,
        breakpoints: { [query]: query.includes('640px') ? isMobileMatch : false },
      }),
  };

  const renderResult = await render(Layout, {
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en: enTranslations, ar: arTranslations },
        translocoConfig: {
          availableLangs: ['en', 'ar'],
          defaultLang: 'en',
          reRenderOnLangChange: true,
        },
        preloadLangs: true,
      }),
    ],
    providers: [
      LanguageService,
      ThemeService,
      { provide: BreakpointObserver, useValue: mockBreakpointObserver },
      provideRouter([
        { path: 'menu', component: DummyMenuComponent },
        { path: 'orders', component: DummyOrdersComponent },
      ]),
    ],
  });

  const router = TestBed.inject(Router);
  const location = TestBed.inject(Location);
  const languageService = TestBed.inject(LanguageService);
  const themeService = TestBed.inject(ThemeService);

  renderResult.fixture.detectChanges();

  return { user, renderResult, router, location, languageService, themeService };
}

describe('Customer Layout — accessibility, toggles, navigation and responsiveness', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('dir', 'ltr');
  });

  it('renders skip link, banner landmark, and main content landmark', async () => {
    await setupCustomerLayout(false);

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toBeTruthy();
    expect(skipLink.getAttribute('href')).toBe('#main-content');

    const banner = screen.getByRole('banner');
    expect(banner).toBeTruthy();

    const main = screen.getByRole('main');
    expect(main).toBeTruthy();
    expect(main.getAttribute('id')).toBe('main-content');
  });

  describe('desktop layout & interactions', () => {
    it('finds navigation links with labels and icons, and clicking navigates to required place', async () => {
      const { user, location } = await setupCustomerLayout(false);

      const menuLink = screen.getByRole('link', { name: 'Menu' });
      const ordersLink = screen.getByRole('link', { name: 'Orders' });

      expect(menuLink).toBeTruthy();
      expect(ordersLink).toBeTruthy();
      expect(screen.getByText('Menu')).toBeTruthy();
      expect(screen.getByText('Orders')).toBeTruthy();

      await user.click(menuLink);
      expect(location.path()).toBe('/menu');

      await user.click(ordersLink);
      expect(location.path()).toBe('/orders');
    });

    it('pressing language toggle button changes text and page direction (dir="rtl")', async () => {
      const { user, languageService, renderResult } = await setupCustomerLayout(false);

      expect(document.documentElement.getAttribute('dir')).toBe('ltr');
      expect(document.documentElement.getAttribute('lang')).toBe('en');

      const langToggleBtn = screen.getByRole('button', { name: /switch language/i });
      await user.click(langToggleBtn);
      renderResult.fixture.detectChanges();

      // Language and direction change in the page
      expect(languageService.language()).toBe('ar');
      expect(document.documentElement.getAttribute('dir')).toBe('rtl');
      expect(document.documentElement.getAttribute('lang')).toBe('ar');

      // Text changes to Arabic
      expect(screen.getByText('قائمة الطعام')).toBeTruthy();
      expect(screen.getByText('الطلبات')).toBeTruthy();
    });

    it('pressing theme toggle button changes theme and visible color variables via data-theme attribute', async () => {
      const { user, themeService, renderResult } = await setupCustomerLayout(false);

      expect(document.documentElement.getAttribute('data-theme')).toBeNull();

      const themeToggleBtn = screen.getByRole('button', { name: /switch to dark mode/i });
      await user.click(themeToggleBtn);
      renderResult.fixture.detectChanges();

      expect(themeService.theme()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      // Toggling again restores light theme
      const lightToggleBtn = screen.getByRole('button', { name: /switch to light mode/i });
      await user.click(lightToggleBtn);
      renderResult.fixture.detectChanges();

      expect(themeService.theme()).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });
  });

  describe('mobile media screen', () => {
    it('renders floating cart button and bottom tabs without breaking the view functionality', async () => {
      const { user, location } = await setupCustomerLayout(true);

      // Bottom navigation tabs are rendered
      const bottomNav = screen.getByRole('navigation', {
        name: /bottom navigation/i,
        hidden: true,
      });
      expect(bottomNav).toBeTruthy();

      // Tab links exist with labels
      const menuTab = screen.getByRole('link', { name: 'Menu' });
      const ordersTab = screen.getByRole('link', { name: 'Orders' });
      expect(menuTab).toBeTruthy();
      expect(ordersTab).toBeTruthy();

      // Clicking link inside mobile bottom tabs navigates properly
      await user.click(ordersTab);
      expect(location.path()).toBe('/orders');

      // Floating cart button is accessible with badge text
      const cartBtn = screen.getByRole('button', { name: /shopping cart with 2 items/i });
      expect(cartBtn).toBeTruthy();
      expect(screen.getByText('2 items in cart')).toBeTruthy();
    });
  });
});
