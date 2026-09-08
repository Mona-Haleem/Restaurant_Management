import { Component, effect, inject, input, output, signal, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CartService } from '../../../../../core/services/cart/cart.service';
import { PaymentData } from '../../../../../core/models';
import { MatIcon } from '@angular/material/icon';
import { SectionCard } from '../../../../../shared/components/section-card/section-card';

@Component({
  selector: 'app-payment-form',
  imports: [MatIcon, ReactiveFormsModule, SectionCard],
  templateUrl: './payment-form.html',
  styleUrl: './payment-form.scss',
})
export class PaymentForm {
  private cartService = inject(CartService);

  form = input.required<FormGroup>();

  submit = output<PaymentData>();

  couponError = signal('');

  appliedCoupon = this.cartService.coupon;

  isValid = computed(() => this.form().valid);

  constructor() {
    effect((onCleanup) => {
      const typeSub = this.form()
        .get('type')
        ?.valueChanges.subscribe((method) => {
          this.updateValidators(method);
        });
      this.updateValidators(this.form().get('type')?.value);

      onCleanup(() => {
        typeSub?.unsubscribe();
      });
    });
  }

  setPaymentMethod(method: 'cash' | 'card') {
    this.form().get('type')?.setValue(method);
  }

  private updateValidators(method: string) {
    const fields = ['cardHolder', 'cardNumber', 'expiry', 'cvv'];

    if (method === 'card') {
      this.form().get('cardHolder')?.setValidators([Validators.required]);
      this.form()
        .get('cardNumber')
        ?.setValidators([Validators.required, Validators.minLength(16)]);
      this.form().get('expiry')?.setValidators([Validators.required]);
      this.form()
        .get('cvv')
        ?.setValidators([Validators.required, Validators.minLength(3)]);
    } else {
      fields.forEach((f) => this.form().get(f)?.clearValidators());
    }

    fields.forEach((f) => this.form().get(f)?.updateValueAndValidity());
  }

  applyCoupon() {
    const code = this.form().value.couponCode?.trim();
    if (!code) return;

    const success = this.cartService.applyCoupon(code);

    if (!success) {
      this.couponError.set('Invalid coupon code');
    } else {
      this.form().get('couponCode')?.setValue('');
      this.couponError.set('');
    }
  }

  removeCoupon() {
    this.cartService.removeCoupon();
  }

  onSubmit() {
    if (this.form().invalid) {
      this.form().markAllAsTouched();
      return;
    }

    const v = this.form().value;

    const data: PaymentData =
      v.type === 'cash'
        ? {
            type: 'cash',
            coupons: v.couponCode,
          }
        : {
            type: 'card',
            coupons: v.couponCode,
            cardData: {
              number: v.cardNumber,
              name: v.cardHolder,
              expiry_date: v.expiry,
              cvv: v.cvv,
            },
          };

    this.submit.emit(data);
  }
}
