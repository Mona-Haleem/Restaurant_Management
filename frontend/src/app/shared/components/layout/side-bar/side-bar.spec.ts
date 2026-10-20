import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { SideBar } from './side-bar';
import { NavLink } from '../nav-bar/nav-bar';
import { LanguageService } from '../../../../core/services/language/language.service';
import { ThemeService } from '../../../../core/services/theme/theme.service';

@Component({
  selector: 'app-dummy-dashboard',
  standalone: true,
  template: '<div data-testid="dashboard-page">Dashboard</div>',
})
class DummyDashboardComponent {}

@Component({
  selector: 'app-dummy-inventory',
  standalone: true,
  template: '<div data-testid="inventory-page">Inventory</div>',
})
class DummyInventoryComponent {}

const managerLinks: NavLink[] = [
  { label: 'dashboard', route: '/manager/dashboard', icon: 'grid_view' },
  { label: 'inventory', route: '/manager/inventory', icon: 'package_2' },
];

const enTranslations = {
  navigation: {
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    sideNav: 'Sidebar navigation',
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
    logoAlt: 'Restaurant logo',
  },
};

const arTranslations = {
  navigation: {
    dashboard: 'لوحة التحكم',
    inventory: 'المخزون',
    sideNav: 'شريط التنقل الجانبي',
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
    logoAlt: 'شعار المطعم',
  },
};

async function setupSideBar(options: { isTablet?: boolean } = {}) {
  const user = userEvent.setup();
  const renderResult = await render(SideBar, {
    componentInputs: {
      links: managerLinks,
      isTablet: options.isTablet ?? false,
      isMobile: false,
    },
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
      provideRouter([
        { path: 'manager/dashboard', component: DummyDashboardComponent },
        { path: 'manager/inventory', component: DummyInventoryComponent },
      ]),
    ],
  });

  const router = TestBed.inject(Router);
  const location = TestBed.inject(Location);
  const languageService = TestBed.inject(LanguageService);
  const themeService = TestBed.inject(ThemeService);

  return { user, renderResult, router, location, languageService, themeService };
}

describe('SideBar — user experience, navigation and accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('dir', 'ltr');
  });

  it('renders a complementary navigation landmark with accessible label and logo', async () => {
    await setupSideBar();

    const landmark = screen.getByRole('complementary', { name: /sidebar navigation/i });
    expect(landmark).toBeTruthy();

    const logo = screen.getByRole('img', { name: /restaurant logo/i });
    expect(logo).toBeTruthy();
  });

  it('renders navigation links with translated labels and accessible icons', async () => {
    const { renderResult } = await setupSideBar();

    const dashLink = screen.getByRole('link', { name: 'Dashboard' });
    const invLink = screen.getByRole('link', { name: 'Inventory' });

    expect(dashLink).toBeTruthy();
    expect(invLink).toBeTruthy();
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Inventory')).toBeTruthy();

    const dashIcon = renderResult.container.querySelector('#dashboard mat-icon');
    expect(dashIcon?.textContent?.trim()).toBe('grid_view');
    expect(dashIcon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('navigates to dashboard route when clicking dashboard link', async () => {
    const { user, location } = await setupSideBar();

    const dashLink = screen.getByRole('link', { name: 'Dashboard' });
    await user.click(dashLink);

    expect(location.path()).toBe('/manager/dashboard');
  });

  it('navigates to inventory route when clicking inventory link', async () => {
    const { user, location } = await setupSideBar();

    const invLink = screen.getByRole('link', { name: 'Inventory' });
    await user.click(invLink);

    expect(location.path()).toBe('/manager/inventory');
  });

  it('marks the active link with aria-current="page" and active class', async () => {
    const { user } = await setupSideBar();

    const dashLink = screen.getByRole('link', { name: 'Dashboard' });
    const invLink = screen.getByRole('link', { name: 'Inventory' });

    expect(dashLink.getAttribute('aria-current')).toBeNull();
    expect(dashLink.classList.contains('active')).toBe(false);

    await user.click(dashLink);
    await waitFor(() => {
      expect(dashLink.getAttribute('aria-current')).toBe('page');
      expect(dashLink.classList.contains('active')).toBe(true);
      expect(invLink.getAttribute('aria-current')).toBeNull();
      expect(invLink.classList.contains('active')).toBe(false);
    });
  });

  it('renders action buttons by role and toggles language when language button is clicked', async () => {
    const { user, languageService, renderResult } = await setupSideBar();

    const initialLang = languageService.language();
    const langBtn = screen.getByRole('button', { name: /switch language/i });
    expect(langBtn).toBeTruthy();

    await user.click(langBtn);
    renderResult.fixture.detectChanges();
    expect(languageService.language()).toBe(initialLang === 'en' ? 'ar' : 'en');
  });

  it('toggles theme when theme toggle button is clicked', async () => {
    const { user, themeService, renderResult } = await setupSideBar();

    const initialTheme = themeService.theme();
    const themeBtn = screen.getByRole('button', {
      name: initialTheme === 'dark' ? /switch to light mode/i : /switch to dark mode/i,
    });
    expect(themeBtn).toBeTruthy();

    await user.click(themeBtn);
    renderResult.fixture.detectChanges();
    expect(themeService.theme()).toBe(initialTheme === 'dark' ? 'light' : 'dark');
  });

  it('renders logout button and user profile text', async () => {
    await setupSideBar();

    expect(screen.getByRole('button', { name: /log out/i })).toBeTruthy();
    expect(screen.getByText('User Name')).toBeTruthy();
    expect(screen.getByText('Manager')).toBeTruthy();
  });

  it('adapts in tablet mode: shows compact logo, applies collapse classes while keeping accessible names', async () => {
    const { renderResult } = await setupSideBar({ isTablet: true });

    // In tablet mode, labels have .collapse class
    const collapsedLabel = renderResult.container.querySelector('#dashboard .collapse');
    expect(collapsedLabel).toBeTruthy();

    // But accessible link names are still intact for assistive technology
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Inventory' })).toBeTruthy();

    // Small logo is rendered
    const smallLogo = renderResult.container.querySelector('img.expanded');
    expect(smallLogo).toBeTruthy();
  });
});
