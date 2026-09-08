import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { CheckoutPage } from './checkout.page';
import { CartService } from '../../../../core/services/cart/cart.service';
import { OrderService } from '../../../../core/services/order/order.service';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CartItem } from '../../../../core/models';
import { signal } from '@angular/core';

describe('CheckoutPage', () => {
  const mockCartItems: CartItem[] = [
    {
      _id: 'item-1',
      name: 'Burger',
      description: 'Classic burger',
      imageUrl: 'burger.jpg',
      price: 50,
      quantity: 2,
      category: 'Burgers',
      isAvailable: true,
      ingredients: [],
      addtions: [],
    },
  ];

  const setup = async (cartItems = mockCartItems) => {
    const mockCartService = {
      cartItems: signal(cartItems),
      getCart: vi.fn().mockReturnValue(cartItems),
      cartSummary: signal({
        subtotal: 100,
        itemDiscount: 0,
        couponDiscount: 0,
        serviceFee: 10,
        tax: 5,
        total: 115,
      }),
      clearCart: vi.fn(),
      coupon: signal(null),
      applyCoupon: vi.fn(),
      removeCoupon: vi.fn(),
    };

    const mockOrderService = {
      placeOrder: vi.fn().mockReturnValue(of({ _id: 'order-123' })),
    };

    const mockRouter = {
      navigate: vi.fn(),
    };

    const result = await render(CheckoutPage, {
      providers: [
        { provide: CartService, useValue: mockCartService },
        { provide: OrderService, useValue: mockOrderService },
        { provide: Router, useValue: mockRouter },
        provideRouter([]),
      ],
    });

    return {
      ...result,
      mockCartService,
      mockOrderService,
      mockRouter,
    };
  };

  it('renders customer logistics form on step 0', async () => {
    await setup();
    expect(screen.getByText(/CUSTOMER LOGISTICS/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/full name/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/\+2 01xxxxxxxxx/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /continue/i })).toBeTruthy();
  });

  it('allows filling customer info and navigating steps', async () => {
    const { detectChanges } = await setup();
    const user = userEvent.setup();

    // Fill customer form (including table number for valid dine-in order type)
    await user.type(screen.getByPlaceholderText(/full name/i), 'Jane Doe');
    await user.type(screen.getByPlaceholderText(/\+2 01xxxxxxxxx/i), '01234567890');
    await user.type(screen.getByPlaceholderText(/table number/i), '5');

    // Click CONTINUE to go to step 1 (Payment)
    await user.click(screen.getByRole('button', { name: /continue/i }));
    detectChanges();

    // Now on step 1 (Payment)
    expect(screen.getByText(/PAYMENT METHOD/i)).toBeTruthy();
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText('Card', { selector: 'p' })).toBeTruthy();
  });

  it('navigates to review step and places order when button is clicked', async () => {
    const { mockOrderService, mockCartService, mockRouter, detectChanges } = await setup();
    const user = userEvent.setup();

    // Fill customer form (including table number)
    await user.type(screen.getByPlaceholderText(/full name/i), 'Jane Doe');
    await user.type(screen.getByPlaceholderText(/\+2 01xxxxxxxxx/i), '01234567890');
    await user.type(screen.getByPlaceholderText(/table number/i), '5');

    // Step 0 -> Step 1
    await user.click(screen.getByRole('button', { name: /continue/i }));
    detectChanges();

    // Confirm step 1 is rendered
    expect(screen.getByText(/PAYMENT METHOD/i)).toBeTruthy();

    // Step 1 -> Step 2
    await user.click(screen.getByRole('button', { name: /continue/i }));
    detectChanges();

    // Now on step 2 (Review)
    expect(screen.getByText(/REVIEW DETAILS/i)).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByRole('button', { name: /place order/i })).toBeTruthy();

    // Click PLACE ORDER
    await user.click(screen.getByRole('button', { name: /place order/i }));

    expect(mockOrderService.placeOrder).toHaveBeenCalledWith(mockCartItems, 'dine-in', 5);
    expect(mockCartService.clearCart).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/customer/orders']);
  });
});
