import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { map } from 'rxjs';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-order-summary',
  imports: [MatIconModule, CurrencyPipe, AsyncPipe],
  templateUrl: './order-summary.html',
  styleUrl: './order-summary.scss',
})
export class OrderSummary {
  private cartService = inject(CartService);
  private router = inject(Router);
  @Input() currentStep?: number;
  @Output() currentStepChange = new EventEmitter<number>();
  @Output() placeOrder = new EventEmitter<void>();

  summary$ = this.cartService.getCartSummary();

  get buttonLabel(): string {
    if (!this.currentStep === undefined) {
      return "Checkout";
    }
    return this.currentStep === 2 ? 'PLACE ORDER' : 'CONTINUE';
  }

  onPress() {
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
