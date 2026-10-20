import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NavBar, NavLink } from './nav-bar';

@Component({ standalone: true, template: '<div data-testid="menu-page">Menu Page Content</div>' })
class DummyMenuComponent {}

@Component({
  standalone: true,
  template: '<div data-testid="orders-page">Orders Page Content</div>',
})
class DummyOrdersComponent {}

const testLinks: NavLink[] = [
  { label: 'menu', route: '/menu', icon: 'menu_book_2' },
  { label: 'orders', route: '/orders', icon: 'receipt' },
];

const testTranslations = {
  navigation: {
    menu: 'Menu',
    orders: 'Orders',
    mainNav: 'Main navigation',
  },
};

async function setupNavBar() {
  const user = userEvent.setup();
  const renderResult = await render(NavBar, {
    componentInputs: {
      links: testLinks,
    },
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en: testTranslations },
        translocoConfig: {
          availableLangs: ['en'],
          defaultLang: 'en',
          reRenderOnLangChange: true,
        },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        { path: 'menu', component: DummyMenuComponent },
        { path: 'orders', component: DummyOrdersComponent },
      ]),
    ],
  });

  const router = TestBed.inject(Router);
  const location = TestBed.inject(Location);

  return { user, renderResult, router, location };
}

describe('NavBar — user experience, navigation and accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('dir', 'ltr');
  });

  it('renders a semantic navigation landmark with accessible label', async () => {
    await setupNavBar();

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(nav).toBeTruthy();
  });

  it('renders all navigation links with correct translated labels and accessible names', async () => {
    await setupNavBar();

    const menuLink = screen.getByRole('link', { name: 'Menu' });
    const ordersLink = screen.getByRole('link', { name: 'Orders' });

    expect(menuLink).toBeTruthy();
    expect(ordersLink).toBeTruthy();
    expect(screen.getByText('Menu')).toBeTruthy();
    expect(screen.getByText('Orders')).toBeTruthy();
  });

  it('renders icons for each link with aria-hidden="true" to avoid screen reader clutter', async () => {
    const { renderResult } = await setupNavBar();

    const menuIcon = renderResult.container.querySelector('#menu mat-icon');
    const ordersIcon = renderResult.container.querySelector('#orders mat-icon');

    expect(menuIcon).toBeTruthy();
    expect(menuIcon?.textContent?.trim()).toBe('menu_book_2');
    expect(menuIcon?.getAttribute('aria-hidden')).toBe('true');

    expect(ordersIcon).toBeTruthy();
    expect(ordersIcon?.textContent?.trim()).toBe('receipt');
    expect(ordersIcon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('navigates to the correct place when clicking a specific link', async () => {
    const { user, location } = await setupNavBar();

    const menuLink = screen.getByRole('link', { name: 'Menu' });
    await user.click(menuLink);

    expect(location.path()).toBe('/menu');
  });

  it('navigates to orders when clicking the orders link', async () => {
    const { user, location } = await setupNavBar();

    const ordersLink = screen.getByRole('link', { name: 'Orders' });
    await user.click(ordersLink);

    expect(location.path()).toBe('/orders');
  });

  it('indicates the active route with aria-current="page" and active class', async () => {
    const { user } = await setupNavBar();

    const menuLink = screen.getByRole('link', { name: 'Menu' });
    const ordersLink = screen.getByRole('link', { name: 'Orders' });

    expect(menuLink.getAttribute('aria-current')).toBeNull();
    expect(menuLink.classList.contains('active')).toBe(false);

    await user.click(menuLink);
    await waitFor(() => {
      expect(menuLink.getAttribute('aria-current')).toBe('page');
      expect(menuLink.classList.contains('active')).toBe(true);
      expect(ordersLink.getAttribute('aria-current')).toBeNull();
      expect(ordersLink.classList.contains('active')).toBe(false);
    });
  });
});
