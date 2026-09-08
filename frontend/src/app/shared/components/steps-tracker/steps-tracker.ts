import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { OrderStatusPipe } from '../../pipes/order-status/order-status.pipe';

@Component({
  selector: 'app-steps-tracker',
  imports: [MatIconModule, OrderStatusPipe],
  templateUrl: './steps-tracker.html',
  styleUrl: './steps-tracker.scss',
  host: { '[class]': 'className()' },
})
export class StepsTracker {
  steps = input.required<{ isIcon: boolean; label: string; icon: string; isLocked?: boolean }[]>();
  currentStep = input.required<number>();
  currentStepChange = output<number>();
  varients = input(['primary']);

  className = computed(() => this.varients().join(' '));

  width = computed(() => {
    const len = this.steps().length;
    return len > 1 ? (this.currentStep() / (len - 1)) * 100 : 0;
  });

  onStepClick(step: number) {
    if (this.steps()[step].isLocked) return;
    this.currentStepChange.emit(step);
  }
}
