import { render, screen } from '@testing-library/angular';
import { MenuPage } from './menu.page';
import { MenuService } from '../../../../core/services/menu/menu.service';
import { CartService } from '../../../../core/services/cart/cart.service';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

describe('MenuPage', () => {
  const menuServiceStub = {
    getCategories: vi.fn().mockReturnValue(of(['Pizza', 'Burger'])),
    filteredItems: signal([
      { _id: '1', name: 'Pizza', category: 'Pizza', price: 10, isAvailable: true },
    ]),
    setActiveFilter: vi.fn(),
    selectedCategory: signal(''),
  };

  const cartServiceStub = {
    cartItems: signal([]),
    cartCount: signal(0),
    cartSummary: signal({
      subtotal: 0,
      itemDiscount: 0,
      couponDiscount: 0,
      serviceFee: 0,
      tax: 0,
      total: 0,
    }),
    addToCart: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
  };

  const setup = async () => {
    return await render(MenuPage, {
      providers: [
        { provide: MenuService, useValue: menuServiceStub },
        { provide: CartService, useValue: cartServiceStub },
        provideRouter([]),
      ],
    });
  };

  it('should render the menu page and layout elements', async () => {
    await setup();
    expect(screen.getByRole('heading', { level: 1, name: /our menu/i })).toBeTruthy();
    expect(screen.getByText('ORDER SUMMARY')).toBeTruthy();
  });
});
