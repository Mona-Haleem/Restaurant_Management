import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { OrderSummary } from './order-summary';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { Router } from '@angular/router';
import { vi } from 'vitest';

describe('OrderSummary', () => {
  const mockSummary = {
    subtotal: 100,
    itemDiscount: 10,
    couponDiscount: 5,
    serviceFee: 8,
    tax: 12,
    total: 105,
  };

  const setup = async (inputs = {}) => {
    const mockCartService = {
      getCartSummary: vi.fn(() => of(mockSummary)),
    };
    const mockRouter = {
      navigate: vi.fn(),
    };
    const onPlaceOrder = vi.fn();

    const result = await render(OrderSummary, {
      inputs,
      providers: [
        { provide: CartService, useValue: mockCartService },
        { provide: Router, useValue: mockRouter },
      ],
      on: {
        placeOrder: onPlaceOrder,
      },
    });

    return {
      ...result,
      mockRouter,
      mockCartService,
      onPlaceOrder,
    };
  };

  it('renders cart summary correctly', async () => {
    await setup();
    expect(screen.getByText(/100\.00/)).toBeTruthy();
    expect(screen.getByText(/-.*10\.00/)).toBeTruthy();
    expect(screen.getByText(/-.*5\.00/)).toBeTruthy();
    expect(screen.getByText(/8\.00/)).toBeTruthy();
    expect(screen.getByText(/12\.00/)).toBeTruthy();
    expect(screen.getByText(/105\.00/)).toBeTruthy();
  });

  it('shows CONTINUE when currentStep is not 2', async () => {
    await setup({ currentStep: 0 });
    expect(screen.getByRole('button', { name: /continue/i })).toBeTruthy();
  });

  it('shows PLACE ORDER when currentStep is 2', async () => {
    await setup({ currentStep: 2 });
    expect(screen.getByRole('button', { name: /place order/i })).toBeTruthy();
  });

  it('advances step to PLACE ORDER button when CONTINUE is clicked on step 1', async () => {
    await setup({ currentStep: 1 });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByRole('button', { name: /place order/i })).toBeTruthy();
  });

  it('emits placeOrder when PLACE ORDER is clicked', async () => {
    const { onPlaceOrder } = await setup({ currentStep: 2 });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /place order/i }));

    expect(onPlaceOrder).toHaveBeenCalled();
  });

  it('does nothing when isNextStepAllowed is false', async () => {
    const { onPlaceOrder, mockRouter } = await setup({ currentStep: 0, isNextStepAllowed: false });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(onPlaceOrder).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /continue/i })).toBeTruthy();
  });
});
