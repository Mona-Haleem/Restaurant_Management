import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { CartSidebar } from './cart-sidebar';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { CartItem } from '../../../../../core/models';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { signal } from '@angular/core';

describe('CartSidebar', () => {
  const mockItem: CartItem = {
    _id: '1',
    name: 'Pizza',
    description: 'Cheese pizza',
    price: 10,
    category: 'Main',
    isAvailable: true,
    ingredients: [],
    quantity: 1,
  };

  const setup = async (initialItems: CartItem[] = []) => {
    const mockCartService = {
      cartItems: signal(initialItems),
      cartCount: signal(initialItems.length),
      cartSummary: signal({
        subtotal: 50,
        itemDiscount: 0,
        couponDiscount: 0,
        serviceFee: 10,
        tax: 10,
        total: 70,
      }),
      clearCart: vi.fn(),
      removeFromCart: vi.fn(),
    };

    const mockRouter = {
      navigate: vi.fn(),
    };

    const result = await render(CartSidebar, {
      providers: [
        { provide: CartService, useValue: mockCartService },
        { provide: Router, useValue: mockRouter },
      ],
    });

    return {
      ...result,
      mockCartService,
      mockRouter,
    };
  };

  it('displays empty cart message when cart is empty', async () => {
    await setup([]);
    expect(screen.getByText(/your cart is empty/i)).toBeTruthy();
  });

  it('renders cart items and summary when cart has items', async () => {
    await setup([mockItem]);
    expect(screen.queryByText(/your cart is empty/i)).toBeFalsy();
    expect(screen.getByText('Pizza')).toBeTruthy();
    expect(screen.getByRole('button', { name: /clear cart/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /checkout/i })).toBeTruthy();
  });

  it('calls clearCart when Clear Cart button is clicked', async () => {
    const { mockCartService } = await setup([mockItem]);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /clear cart/i }));
    expect(mockCartService.clearCart).toHaveBeenCalledTimes(1);
  });

  it('navigates to checkout when Checkout button is clicked', async () => {
    const { mockRouter } = await setup([mockItem]);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /checkout/i }));
    expect(mockRouter.navigate).toHaveBeenCalledWith(['customer', 'checkout']);
  });
});
