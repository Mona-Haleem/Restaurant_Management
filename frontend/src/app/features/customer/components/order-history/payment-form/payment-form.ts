import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AsyncPipe } from '@angular/common';
import { SectionCard } from '../../../../../shared/section-card/section-card';
import { CartService } from '../../../../../core/services/cart/cart.service';

export type PaymentMethod = 'cash' | 'card';

export interface PaymentData {
  method: PaymentMethod;
  cardNumber?: string;
  cardHolder?: string;
  expiry?: string;
  cvv?: string;
}

@Component({
  selector: 'app-payment-form',
  imports: [FormsModule, MatIconModule, SectionCard, AsyncPipe],
  templateUrl: './payment-form.html',
  styleUrl: './payment-form.scss',
})
export class PaymentForm implements OnInit {
  private cartService = inject(CartService);

  paymentMethod: PaymentMethod = 'cash';
  cardNumber: string = '';
  cardHolder: string = '';
  expiry: string = '';
  cvv: string = '';
  
  couponCode: string = '';
  couponError: string = '';
  appliedCoupon$ = this.cartService.coupon$;

  @Output() submit = new EventEmitter<PaymentData>();
  @Output() methodChange = new EventEmitter<PaymentMethod>();

  ngOnInit() {
    this.methodChange.emit(this.paymentMethod);
  }

  setPaymentMethod(method: PaymentMethod) {
    this.paymentMethod = method;
    this.methodChange.emit(this.paymentMethod);
  }

  applyCoupon() {
    this.couponError = '';
    if (!this.couponCode.trim()) return;
    
    const success = this.cartService.applyCoupon(this.couponCode);
    if (!success) {
      this.couponError = 'Invalid coupon code';
    } else {
      this.couponCode = '';
    }
  }

  removeCoupon() {
    this.cartService.removeCoupon();
  }

  onSubmit() {
    this.submit.emit({
      method: this.paymentMethod,
      ...(this.paymentMethod === 'card' && {
        cardNumber: this.cardNumber,
        cardHolder: this.cardHolder,
        expiry: this.expiry,
        cvv: this.cvv,
      }),
    });
  }
}
