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

@Component({ standalone: true, template: '<div data-testid="dash-view">Dashboard Content</div>' })
class DummyDashboardComponent {}

@Component({
  standalone: true,
  template: '<div data-testid="menu-view">Menu Manager Content</div>',
})
class DummyMenuComponent {}

@Component({ standalone: true, template: '<div data-testid="inv-view">Inventory Content</div>' })
class DummyInventoryComponent {}

const enTranslations = {
  navigation: {
    dashboard: 'Dashboard',
    'menu manager': 'Menu Manager',
    menuManager: 'Menu Manager',
    inventory: 'Inventory',
    'reports & waste': 'Reports & Waste',
    reports: 'Reports & Waste',
    'staff directory': 'Staff Directory',
    staff: 'Staff Directory',
    skipToContent: 'Skip to main content',
    mainNav: 'Main navigation',
    sideNav: 'Sidebar navigation',
    bottomNav: 'Bottom navigation',
    logoAlt: 'Restaurant logo',
    language: 'Language',
    toggleLanguage: 'Switch language',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode',
    logout: 'Log Out',
    userName: 'User Name',
    role: 'Manager',
    actions: 'Actions',
  },
};

const arTranslations = {
  navigation: {
    dashboard: 'لوحة التحكم',
    'menu manager': 'إدارة القائمة',
    menuManager: 'إدارة القائمة',
    inventory: 'المخزون',
    'reports & waste': 'التقارير والهدر',
    reports: 'التقارير والهدر',
    'staff directory': 'دليل الموظفين',
    staff: 'دليل الموظفين',
    skipToContent: 'الانتقال إلى المحتوى الرئيسي',
    mainNav: 'التنقل الرئيسي',
    sideNav: 'شريط التنقل الجانبي',
    bottomNav: 'شريط التنقل السفلي',
    logoAlt: 'شعار المطعم',
    language: 'اللغة',
    toggleLanguage: 'تغيير اللغة',
    theme: 'السمة',
    themeLight: 'فاتح',
    themeDark: 'داكن',
    switchToLight: 'التبديل إلى الوضع الفاتح',
    switchToDark: 'التبديل إلى الوضع الداكن',
    logout: 'تسجيل الخروج',
    userName: 'اسم المستخدم',
    role: 'مدير',
    actions: 'الإجراءات',
  },
};

async function setupManagerLayout(breakpoint: 'desktop' | 'tablet' | 'mobile' = 'desktop') {
  const user = userEvent.setup();

  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';

  const mockBreakpointObserver = {
    isMatched: (query: string) => {
      if (query.includes('640px')) return isMobile;
      if (query.includes('1024px')) return isTablet || isMobile;
      return false;
    },
    observe: (query: string) => {
      let matches = false;
      if (query.includes('640px')) {
        matches = isMobile;
      } else if (query.includes('1024px')) {
        matches = isTablet || isMobile;
      }
      return of({
        matches,
        breakpoints: { [query]: matches },
      });
    },
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
        {
          path: 'manager/dashboard',
          component: DummyDashboardComponent,
          data: { headerTitle: 'dashboard' },
        },
        {
          path: 'manager/menu',
          component: DummyMenuComponent,
          data: { headerTitle: 'menu manager' },
        },
        {
          path: 'manager/inventory',
          component: DummyInventoryComponent,
          data: { headerTitle: 'inventory' },
        },
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

describe('Manager Layout — accessibility, toggles, navigation, and responsiveness', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('dir', 'ltr');
  });

  it('renders skip link, sidebar complementary landmark, header banner, and main content landmark', async () => {
    await setupManagerLayout('desktop');

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toBeTruthy();
    expect(skipLink.getAttribute('href')).toBe('#main-content');

    const sidebar = screen.getByRole('complementary', { name: /sidebar navigation/i });
    expect(sidebar).toBeTruthy();

    const banner = screen.getByRole('banner');
    expect(banner).toBeTruthy();

    const main = screen.getByRole('main');
    expect(main).toBeTruthy();
    expect(main.getAttribute('id')).toBe('main-content');
  });

  describe('desktop layout & interactions', () => {
    it('finds navigation links with labels and icons, and clicking navigates to required place', async () => {
      const { user, location } = await setupManagerLayout('desktop');

      const dashLink = screen.getByRole('link', { name: 'Dashboard' });
      const menuLink = screen.getByRole('link', { name: 'Menu Manager' });
      const invLink = screen.getByRole('link', { name: 'Inventory' });
      const reportsLink = screen.getByRole('link', { name: 'Reports & Waste' });
      const staffLink = screen.getByRole('link', { name: 'Staff Directory' });

      expect(dashLink).toBeTruthy();
      expect(menuLink).toBeTruthy();
      expect(invLink).toBeTruthy();
      expect(reportsLink).toBeTruthy();
      expect(staffLink).toBeTruthy();

      await user.click(menuLink);
      expect(location.path()).toBe('/manager/menu');

      await user.click(invLink);
      expect(location.path()).toBe('/manager/inventory');
    });

    it('pressing language toggle button changes text and page direction (dir="rtl")', async () => {
      const { user, languageService, renderResult } = await setupManagerLayout('desktop');

      expect(document.documentElement.getAttribute('dir')).toBe('ltr');
      expect(document.documentElement.getAttribute('lang')).toBe('en');

      const langToggleBtn = screen.getByRole('button', { name: /switch language/i });
      await user.click(langToggleBtn);
      renderResult.fixture.detectChanges();

      expect(languageService.language()).toBe('ar');
      expect(document.documentElement.getAttribute('dir')).toBe('rtl');
      expect(document.documentElement.getAttribute('lang')).toBe('ar');

      // Verify translated text changes in the page
      expect(screen.getByText('المخزون')).toBeTruthy();
    });

    it('pressing theme toggle button changes theme and visible color variables via data-theme attribute', async () => {
      const { user, themeService, renderResult } = await setupManagerLayout('desktop');

      expect(document.documentElement.getAttribute('data-theme')).toBeNull();

      const themeToggleBtn = screen.getByRole('button', { name: /switch to dark mode/i });
      await user.click(themeToggleBtn);
      renderResult.fixture.detectChanges();

      expect(themeService.theme()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      const lightToggleBtn = screen.getByRole('button', { name: /switch to light mode/i });
      await user.click(lightToggleBtn);
      renderResult.fixture.detectChanges();

      expect(themeService.theme()).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });
  });

  describe('tablet media screen', () => {
    it('collapses sidebar text and maintains full view functionality', async () => {
      const { user, location, renderResult } = await setupManagerLayout('tablet');

      // In tablet screen, sidebar landmark is still present
      const sidebar = screen.getByRole('complementary', { name: /sidebar navigation/i });
      expect(sidebar).toBeTruthy();

      // Labels get .collapse class
      const collapsedLabel = renderResult.container.querySelector('#dashboard .collapse');
      expect(collapsedLabel).toBeTruthy();

      // Navigation links remain fully accessible by role and name
      const dashLink = screen.getByRole('link', { name: 'Dashboard' });
      expect(dashLink).toBeTruthy();

      const invLink = screen.getByRole('link', { name: 'Inventory' });
      await user.click(invLink);
      expect(location.path()).toBe('/manager/inventory');
    });
  });

  describe('mobile media screen', () => {
    it('hides sidebar, renders bottom tabs navigation, and preserves view functionality', async () => {
      const { user, location } = await setupManagerLayout('mobile');

      // Sidebar is hidden on mobile
      expect(screen.queryByRole('complementary', { name: /sidebar navigation/i })).toBeNull();

      // Bottom tabs navigation appears
      const bottomNav = screen.getByRole('navigation', {
        name: /bottom navigation/i,
        hidden: true,
      });
      expect(bottomNav).toBeTruthy();

      // Navigation links are present in bottom tabs
      const dashTab = screen.getByRole('link', { name: 'Dashboard' });
      const menuTab = screen.getByRole('link', { name: 'Menu Manager' });
      const invTab = screen.getByRole('link', { name: 'Inventory' });

      expect(dashTab).toBeTruthy();
      expect(menuTab).toBeTruthy();
      expect(invTab).toBeTruthy();

      // Clicking link navigates properly
      await user.click(menuTab);
      expect(location.path()).toBe('/manager/menu');
    });
  });
});
