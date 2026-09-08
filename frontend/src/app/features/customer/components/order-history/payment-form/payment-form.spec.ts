import { render, screen } from '@testing-library/angular';
import { PaymentForm } from './payment-form';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { FormBuilder } from '@angular/forms';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { BehaviorSubject } from 'rxjs';

describe('PaymentForm', () => {
  const fb = new FormBuilder();

  function createForm() {
    return fb.group({
      type: ['cash'],
      couponCode: [''],
      cardHolder: [''],
      cardNumber: [''],
      expiry: [''],
      cvv: [''],
    });
  }

  function setupCartService(initialCoupon: any = null) {
    const couponSubject = new BehaviorSubject(initialCoupon);
    return {
      coupon$: couponSubject.asObservable(),
      applyCoupon: vi.fn(),
      removeCoupon: vi.fn(),
      _couponSubject: couponSubject,
    };
  }

  it('should render and default to cash payment', async () => {
    const cartServiceStub = setupCartService();
    await render(PaymentForm, {
      inputs: { form: createForm() },
      providers: [{ provide: CartService, useValue: cartServiceStub }],
    });

    expect(screen.queryByPlaceholderText('0000 0000 0000 0000')).toBeFalsy();
  });

  it('should toggle between cash and card and show/hide card fields', async () => {
    const user = userEvent.setup();
    const cartServiceStub = setupCartService();
    await render(PaymentForm, {
      inputs: { form: createForm() },
      providers: [{ provide: CartService, useValue: cartServiceStub }],
    });

    expect(screen.queryByPlaceholderText('0000 0000 0000 0000')).toBeFalsy();

    await user.click(screen.getByText('Card'));
    expect(screen.getByPlaceholderText('0000 0000 0000 0000')).toBeTruthy();

    await user.click(screen.getByText('Cash'));
    expect(screen.queryByPlaceholderText('0000 0000 0000 0000')).toBeFalsy();
  });

  it('should apply valid coupon and show coupon block', async () => {
    const user = userEvent.setup();
    const cartServiceStub = setupCartService();
    cartServiceStub.applyCoupon.mockReturnValue(true);

    const { detectChanges } = await render(PaymentForm, {
      inputs: { form: createForm() },
      providers: [{ provide: CartService, useValue: cartServiceStub }],
    });

    const couponInput = screen.getByPlaceholderText('coupon code');
    await user.type(couponInput, 'SAVE20');
    await user.click(screen.getByRole('button', { name: /APPLY/i }));

    expect(cartServiceStub.applyCoupon).toHaveBeenCalledWith('SAVE20');

    // Simulate cart service emitting the new coupon state
    cartServiceStub._couponSubject.next({ code: 'SAVE20', discountPercent: 20 } as any);
    detectChanges();

    expect(screen.getByText(/SAVE20.*20% OFF/i)).toBeTruthy();
  });

  it('should show error on invalid coupon', async () => {
    const user = userEvent.setup();
    const cartServiceStub = setupCartService();
    cartServiceStub.applyCoupon.mockReturnValue(false);

    await render(PaymentForm, {
      inputs: { form: createForm() },
      providers: [{ provide: CartService, useValue: cartServiceStub }],
    });

    const couponInput = screen.getByPlaceholderText('coupon code');
    await user.type(couponInput, 'INVALID');
    await user.click(screen.getByRole('button', { name: /APPLY/i }));

    expect(screen.getByText('Invalid coupon code')).toBeTruthy();
  });

  it('should call CartService.removeCoupon when remove button is clicked', async () => {
    const user = userEvent.setup();
    const cartServiceStub = setupCartService({ code: 'SAVE20', discountPercent: 20 });

    await render(PaymentForm, {
      inputs: { form: createForm() },
      providers: [{ provide: CartService, useValue: cartServiceStub }],
    });

    await user.click(screen.getByRole('button', { name: /REMOVE/i }));
    expect(cartServiceStub.removeCoupon).toHaveBeenCalled();
  });

  it('should emit form data on submit', async () => {
    const user = userEvent.setup();
    const cartServiceStub = setupCartService();
    const submitSpy = vi.fn();
    const form = createForm();

    await render(PaymentForm, {
      inputs: { form },
      providers: [{ provide: CartService, useValue: cartServiceStub }],
      on: { submit: submitSpy },
    });

    const couponInput = screen.getByPlaceholderText('coupon code');
    await user.type(couponInput, 'COUPON123');

    await user.type(couponInput, '{Enter}'); // trigger form submit

    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cash',
        coupons: 'COUPON123',
      }),
    );
  });
});
