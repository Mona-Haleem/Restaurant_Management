import { Component, input, model } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-stepper-btn',
  imports: [MatIcon],
  templateUrl: './stepper-btn.html',
  styleUrl: './stepper-btn.scss',
  host: {
    role: 'group',
    '[attr.aria-label]': '!labelledby() ? label() : undefined',
    '[attr.aria-labelledby]': 'labelledby()? labelledby() : undefined',
  },
})
export class StepperBtn {
  label = input<string>('Quantity');
  labelledby = input<string>();

  value = model<number>(0);
  min = input<number>();
  max = input<number>();
  step = input<number>(1);

  get atMin(): boolean {
    const min = this.min();
    return min != null && this.value() <= min;
  }

  get atMax(): boolean {
    const max = this.max();
    return max != null && this.value() >= max;
  }

  increment() {
    this.value.update((v) => {
      const step = this.step();
      const next = Math.round((v + step) * 1e10) / 1e10;
      const max = this.max();
      return max != null ? Math.min(next, max) : next;
    });
  }

  decrement() {
    this.value.update((v) => {
      const step = this.step();
      const next = Math.round((v - step) * 1e10) / 1e10;
      const min = this.min();
      return min != null ? Math.max(next, min) : next;
    });
  }

  handleBlur(event: Event) {
    const input = event.target as HTMLInputElement;
    const number = input.valueAsNumber;

    const min = this.min();
    const max = this.max();

    if (
      input.value === '' ||
      Number.isNaN(number) ||
      (min != null && number < min) ||
      (max != null && number > max)
    ) {
      input.value = String(this.value());
      return;
    }

    this.value.set(number);
  }
}
