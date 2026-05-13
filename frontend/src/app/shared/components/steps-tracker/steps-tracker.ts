import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-steps-tracker',
  imports: [MatIconModule],
  templateUrl: './steps-tracker.html',
  styleUrl: './steps-tracker.scss',
})
export class StepsTracker {
  @Input({ required: true }) steps!: { isIcon: boolean, label: string, icon: string, isLocked?: boolean }[];
  @Input({ required: true }) currentStep: number = 0;
  @Output() currentStepChange = new EventEmitter<number>();

  @Input() varients = ['primary']

  @HostBinding('class')
  get className(): string {
    return this.varients.join(' ');
  }
  get width(): number {
    return this.currentStep / (this.steps.length - 1) * 100;
  }

  onStepClick(step: number) {
    if (this.steps[step].isLocked) return;
    this.currentStepChange.emit(step);
  }
}
