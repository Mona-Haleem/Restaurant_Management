import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { MatIcon } from '@angular/material/icon';
import { AsyncPipe, CurrencyPipe } from '@angular/common';

@Component({
  selector: 'app-order-summary',
  imports: [MatIcon, CurrencyPipe, AsyncPipe],
  templateUrl: './order-summary.html',
  styleUrl: './order-summary.scss',
})
export class OrderSummary {
  private router = inject(Router);
  private cartService = inject(CartService);

  @Input() currentStep = 0;
  @Input() isNextStepAllowed = true;

  @Output() currentStepChange = new EventEmitter<number>();
  @Output() placeOrder = new EventEmitter<void>();

  summary$ = this.cartService.getCartSummary();

  get buttonLabel(): string {
    if (this.currentStep === 2) return 'PLACE ORDER';
    return 'CONTINUE';
  }

  onPress() {
    console.log(this.currentStep, this.isNextStepAllowed)
    if (!this.isNextStepAllowed) return;

    if (this.currentStep === undefined) {
      this.router.navigate(['customer', 'checkout'])
    } else if (this.currentStep === 2) {
      this.placeOrder.emit();
    } else {
      this.currentStep++;
      this.currentStepChange.emit(this.currentStep);
    }


  }
}