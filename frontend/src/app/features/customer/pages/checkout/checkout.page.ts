import { Component, inject, Input } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { CartService } from '../../../../core/services/cart/cart.service';
import { OrderService } from '../../../../core/services/order/order.service';
import { CartResolvedData } from '../../resolvers/cart.resolver';
import { CustomerData, PaymentData, OrderType } from '../../../../core/models';
import { EtaStatus } from '../../components/order-history/eta-status/eta-status';
import { PaymentForm } from '../../components/order-history/payment-form/payment-form';
import { OrderSummary } from '../../components/order-history/order-summary/order-summary';
import { CustomerDataForm } from '../../components/order-history/customer-data-form/customer-data-form';
import { SectionCard } from '../../../../shared/components/section-card/section-card';
import { OrderSummeryItem } from '../../components/order-history/order-summery-item/order-summery-item';
import { AsyncPipe } from '@angular/common';
import { StepsTracker } from '../../../../shared/components/steps-tracker/steps-tracker';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function orderTypeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const type = control.get('type')?.value;

    const location = control.get('location')?.value;

    if ((type === 'delivery' || type === 'dine-in') && (location === undefined || location === null)) {
      return { locationRequired: true };
    }


    return null;
  };
}

export function paymentValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const method = control.get('type')?.value;

    const cardHolder = control.get('cardHolder')?.value;
    const cardNumber = control.get('cardNumber')?.value;
    const expiry = control.get('expiry')?.value;
    const cvv = control.get('cvv')?.value;

    if (method === 'card') {
      const errors: any = {};

      if (!cardHolder) errors.cardHolderRequired = true;
      if (!cardNumber) errors.cardNumberRequired = true;
      if (!expiry) errors.expiryRequired = true;
      if (!cvv) errors.cvvRequired = true;

      return Object.keys(errors).length ? errors : null;
    }

    return null;
  };
}

const storedCustomerDate = localStorage.getItem('checkout_customer')
let parsedData: | CustomerData;
if (storedCustomerDate) {
  parsedData = JSON.parse(storedCustomerDate)
  console.log(parsedData);
}
@Component({
  selector: 'app-checkout',
  imports: [EtaStatus, PaymentForm, OrderSummary, StepsTracker, CustomerDataForm, SectionCard, OrderSummeryItem, AsyncPipe],
  templateUrl: './checkout.page.html',
  styleUrl: './checkout.page.scss',
})
export class CheckoutPage {
  private fb = inject(FormBuilder);
  private cartService = inject(CartService);
  private orderService = inject(OrderService);
  private router = inject(Router);
  cartItems$ = this.cartService.cartItems$
  @Input() cartData?: CartResolvedData;

  currentStep = 0;

  steps = [{ isIcon: false, label: 'info', icon: '1', isLocked: false }, { isIcon: false, label: 'payment', icon: '2', isLocked: true }, { isIcon: false, label: 'review', icon: '3', isLocked: true },];

  customerForm: FormGroup = this.fb.group({
    fullName: [parsedData?.fullName ?? '', [Validators.required, Validators.minLength(3)]],
    phone: [parsedData?.phone ?? '', [Validators.required, Validators.minLength(3)]],
    type: [parsedData?.type ?? 'dine-in'],
    location: [parsedData?.location],
  }, {
    validators: [orderTypeValidator()]
  }
  );

  paymentForm: FormGroup = this.fb.group({
    type: ['cash'],
    cardHolder: [''],
    cardNumber: [''],
    expiry: [''],
    cvv: [''],
    couponCode: ['']
  }, {
    validators: [paymentValidator()]
  });

  get isNextStepAllowed(): boolean {
    if (this.currentStep === 0) return this.customerForm.valid;
    if (this.currentStep === 1) return this.paymentForm.valid;
    return true;
  }

  onStepChange(step: number) {
    this.currentStep = step;

    this.steps = this.steps.map((s, i) => ({
      ...s,
      isLocked: i > step
    }));
  }

  onPlaceOrder() {
    const items = this.cartService.getCart();
    if (!items.length) return;

    const customer = this.customerForm.value;
    const payment = this.paymentForm.value;

    const type: OrderType = customer.type;

    const location =
      type === 'dine-in'
        ? customer.table_number ?? 1
        : type === 'delivery'
          ? customer.delivery_address
          : 'pickup';

    const paymentData: PaymentData =
      payment.paymentMethod === 'cash'
        ? {
          type: 'cash',
          coupons: payment.couponCode,
        }
        : {
          type: 'card',
          coupons: payment.couponCode,
          cardData: {
            number: payment.cardNumber,
            name: payment.cardHolder,
            expiry_date: payment.expiry,
            cvv: payment.cvv,
          }
        };

    this.orderService.placeOrder(items, type, location).subscribe(() => {
      this.cartService.clearCart();
      this.router.navigate(['/customer/orders']);
    });
  }

  onCustomerData(data: CustomerData) {

  }
  onPaymentMethodSubmit(data: PaymentData) {

  }
}