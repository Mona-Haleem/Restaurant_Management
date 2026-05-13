import { CurrencyPipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-order-summary',
  imports: [MatIconModule, CurrencyPipe],
  templateUrl: './order-summary.html',
  styleUrl: './order-summary.scss',
})
export class OrderSummary {
  @Input({ required: true }) currentStep: number = 0;
  @Output() currentStepChange = new EventEmitter<number>();
  subtotal = 100;
  serviceFee = 10;
  tax = 5;
  discount = 0;

  total = this.subtotal + this.serviceFee + this.tax - this.discount;

  onPress() {
    this.currentStep++;
    this.currentStepChange.emit(this.currentStep);
  }
}
