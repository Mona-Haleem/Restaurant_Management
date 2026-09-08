import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { OrderSummeryItem } from './order-summery-item';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { vi } from 'vitest';
import { CartItem } from '../../../../../core/models';

describe('OrderSummeryItem', () => {
  const mockItem: CartItem = {
    _id: 'item-1',
    name: 'Margherita Pizza',
    description: 'Classic cheese pizza',
    price: 100,
    category: 'Pizza',
    isAvailable: true,
    ingredients: [],
    quantity: 2,
    imageUrl: 'pizza.jpg',
    addtions: ['Extra Cheese', 'Olives'],
  };

  const setup = async (view: 'default' | 'readonly' = 'default') => {
    const cartServiceStub = {
      addToCart: vi.fn(),
      removeFromCart: vi.fn(),
      removeItem: vi.fn(),
    };

    await render(OrderSummeryItem, {
      inputs: { item: mockItem, view },
      providers: [{ provide: CartService, useValue: cartServiceStub }],
    });

    return { cartServiceStub };
  };

  it('should display the item name, image, and formatted additions', async () => {
    await setup();
    const img = screen.getByAltText('Margherita Pizza') as HTMLImageElement;
    expect(img.src).toContain('pizza.jpg');

    expect(screen.getByText('Margherita Pizza')).toBeTruthy();
    expect(screen.getByText('Extra Cheese, Olives')).toBeTruthy();
  });

  it('should display the correct total price', async () => {
    await setup();
    // EGP 200.00
    expect(screen.getByText(/200\.00/)).toBeTruthy();
  });

  describe('Default View', () => {
    it('should render quantity controls and delete button', async () => {
      await setup('default');
      expect(screen.getByRole('button', { name: '+' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '-' })).toBeTruthy();
      expect(screen.getByRole('button', { name: /REMEVOE ITEM/i })).toBeTruthy();
      expect(screen.getByText('2x')).toBeTruthy();
    });

    it('should call CartService.addToCart when + button is clicked', async () => {
      const { cartServiceStub } = await setup('default');
      await userEvent.click(screen.getByRole('button', { name: '+' }));
      expect(cartServiceStub.addToCart).toHaveBeenCalledWith(mockItem);
    });

    it('should call CartService.removeFromCart when - button is clicked', async () => {
      const { cartServiceStub } = await setup('default');
      await userEvent.click(screen.getByRole('button', { name: '-' }));
      expect(cartServiceStub.removeFromCart).toHaveBeenCalledWith('item-1');
    });

    it('should call CartService.removeItem when delete button is clicked', async () => {
      const { cartServiceStub } = await setup('default');
      await userEvent.click(screen.getByRole('button', { name: /REMEVOE ITEM/i }));
      expect(cartServiceStub.removeItem).toHaveBeenCalledWith('item-1');
    });
  });

  describe('Readonly View', () => {
    it('should NOT render quantity controls or delete button', async () => {
      await setup('readonly');
      expect(screen.queryByRole('button', { name: '+' })).toBeFalsy();
      expect(screen.queryByRole('button', { name: '-' })).toBeFalsy();
      expect(screen.queryByRole('button', { name: /REMEVOE ITEM/i })).toBeFalsy();
    });

    it('should display the quantity as plain text', async () => {
      await setup('readonly');
      expect(screen.getByText('QTY:2')).toBeTruthy();
    });
  });
});
