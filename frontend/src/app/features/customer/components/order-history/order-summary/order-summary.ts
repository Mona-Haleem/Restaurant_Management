import { Component, inject, input, model, output, computed } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { MatIcon } from '@angular/material/icon';
import { CurrencyPipe } from '@angular/common';

@Component({
  selector: 'app-order-summary',
  imports: [MatIcon, CurrencyPipe],
  templateUrl: './order-summary.html',
  styleUrl: './order-summary.scss',
})
export class OrderSummary {
  private router = inject(Router);
  private cartService = inject(CartService);

  currentStep = model(0);
  isNextStepAllowed = input(true);

  placeOrder = output<void>();

  summary = this.cartService.cartSummary;

  buttonLabel = computed(() => {
    if (this.currentStep() === 2) return 'PLACE ORDER';
    return 'CONTINUE';
  });

  onPress() {
    console.log(this.currentStep(), this.isNextStepAllowed());
    if (!this.isNextStepAllowed()) return;

    if (this.currentStep() === undefined) {
      this.router.navigate(['customer', 'checkout']);
    } else if (this.currentStep() === 2) {
      this.placeOrder.emit();
    } else {
      this.currentStep.update((v) => v + 1);
    }
  }
}
