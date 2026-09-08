import { render, screen } from '@testing-library/angular';
import { CartPage } from './cart.page';
import { CartService } from '../../../../core/services/cart/cart.service';
import { vi } from 'vitest';
import { CartItem } from '../../../../core/models';
import { signal } from '@angular/core';

describe('CartPage', () => {
  const mockItem: CartItem = {
    _id: 'item-1',
    name: 'Burger',
    description: 'Classic beef burger',
    imageUrl: 'burger.jpg',
    price: 75,
    quantity: 2,
    category: 'Burgers',
    isAvailable: true,
    ingredients: [],
    addtions: [],
  };

  const setup = async (items: CartItem[]) => {
    const cartItemsSignal = signal(items);
    const mockCartService = {
      cartItems: cartItemsSignal,
      cartCount: signal(items.length),
      cartSummary: signal({
        subtotal: 150,
        itemDiscount: 0,
        couponDiscount: 0,
        serviceFee: 10,
        tax: 5,
        total: 165,
      }),
      addToCart: vi.fn(),
      removeFromCart: vi.fn(),
      removeItem: vi.fn(),
    };

    const result = await render(CartPage, {
      providers: [{ provide: CartService, useValue: mockCartService }],
    });

    return {
      ...result,
      cartItemsSignal,
      mockCartService,
    };
  };

  describe('when cart is empty', () => {
    it('renders empty cart message and no order summary', async () => {
      await setup([]);
      expect(screen.getByText(/your cart is empty/i)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /continue|place order/i })).toBeFalsy();
    });
  });

  describe('when cart has items', () => {
    it('renders cart items and summary', async () => {
      await setup([mockItem, { ...mockItem, _id: 'item-2', name: 'Pizza', quantity: 1 }]);

      expect(screen.queryByText(/your cart is empty/i)).toBeFalsy();
      expect(screen.getByText('Burger')).toBeTruthy();
      expect(screen.getByText('Pizza')).toBeTruthy();
    });

    it('reactively updates view when cart items change', async () => {
      const { cartItemsSignal, detectChanges } = await setup([mockItem]);

      expect(screen.getByText('Burger')).toBeTruthy();

      // Update signal with new items
      cartItemsSignal.set([mockItem, { ...mockItem, _id: 'item-2', name: 'Salad', quantity: 1 }]);
      detectChanges();

      expect(screen.getByText('Burger')).toBeTruthy();
      expect(screen.getByText('Salad')).toBeTruthy();
    });
  });
});
