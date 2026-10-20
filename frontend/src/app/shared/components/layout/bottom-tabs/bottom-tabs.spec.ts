import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BottomTabs } from './bottom-tabs';
import { NavLink } from '../nav-bar/nav-bar';

@Component({ standalone: true, template: '<div data-testid="menu-view">Customer Menu</div>' })
class DummyMenuComponent {}

@Component({ standalone: true, template: '<div data-testid="orders-view">Customer Orders</div>' })
class DummyOrdersComponent {}

const sampleLinks: NavLink[] = [
  { label: 'menu', route: '/menu', icon: 'menu_book_2' },
  { label: 'orders', route: '/orders', icon: 'receipt' },
];

const mockTranslations = {
  navigation: {
    menu: 'Menu',
    orders: 'Orders',
    bottomNav: 'Bottom navigation',
  },
};

async function setupBottomTabs() {
  const user = userEvent.setup();
  const renderResult = await render(BottomTabs, {
    componentInputs: {
      links: sampleLinks,
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

describe('BottomTabs — user experience, navigation and accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('dir', 'ltr');
  });

  it('renders a navigation landmark with an accessible name', async () => {
    await setupBottomTabs();

    const nav = screen.getByRole('navigation', { name: /bottom navigation/i, hidden: true });
    expect(nav).toBeTruthy();
  });

  it('renders all tabs with translated labels and icons', async () => {
    const { renderResult } = await setupBottomTabs();

    const menuTab = screen.getByRole('link', { name: 'Menu', hidden: true });
    const ordersTab = screen.getByRole('link', { name: 'Orders', hidden: true });

    expect(menuTab).toBeTruthy();
    expect(ordersTab).toBeTruthy();

    expect(screen.getByText('Menu')).toBeTruthy();
    expect(screen.getByText('Orders')).toBeTruthy();

    const menuIcon = renderResult.container.querySelector('#menu mat-icon');
    const ordersIcon = renderResult.container.querySelector('#orders mat-icon');

    expect(menuIcon?.textContent?.trim()).toBe('menu_book_2');
    expect(menuIcon?.getAttribute('aria-hidden')).toBe('true');
    expect(ordersIcon?.textContent?.trim()).toBe('receipt');
    expect(ordersIcon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('navigates to the required destination when clicking a tab link', async () => {
    const { user, location } = await setupBottomTabs();

    const menuTab = screen.getByRole('link', { name: 'Menu', hidden: true });
    await user.click(menuTab);
    await waitFor(() => {
      expect(location.path()).toBe('/menu');
    });
  });

  it('navigates to orders when clicking orders tab', async () => {
    const { user, location } = await setupBottomTabs();

    const ordersTab = screen.getByRole('link', { name: 'Orders', hidden: true });
    await user.click(ordersTab);
    await waitFor(() => {
      expect(location.path()).toBe('/orders');
    });
  });

  it('sets aria-current="page" and active class on the active route link', async () => {
    const { user } = await setupBottomTabs();
    const ordersTab = screen.getByRole('link', {
      name: 'Orders',
      hidden: true,
    });
    const menuTab = screen.getByRole('link', {
      name: 'Menu',
      hidden: true,
    });

    expect(ordersTab?.getAttribute('aria-current')).toBeNull();
    expect(ordersTab?.classList.contains('active')).toBe(false);

    await user.click(ordersTab!);
    await waitFor(() => {
      expect(ordersTab?.getAttribute('aria-current')).toBe('page');
      expect(ordersTab?.classList.contains('active')).toBe(true);
      expect(menuTab?.getAttribute('aria-current')).toBeNull();
      expect(menuTab?.classList.contains('active')).toBe(false);
    });
  });
});
