import { Component, input, computed } from '@angular/core';

export type ProgressVariant = 'success' | 'warning' | 'critical' | 'info' | 'neutral' | 'auto';

/**
 * Thresholds used when variant is 'auto' (the default):
 *   value >= 70  →  success  (green / teal)
 *   value >= 40  →  warning  (amber)
 *   value <  40  →  critical (red)
 *
 * Override with an explicit variant to disable auto-detection.
 */
const AUTO_THRESHOLDS: { min: number; variant: ProgressVariant }[] = [
  { min: 70, variant: 'success' },
  { min: 40, variant: 'warning' },
  { min: 0, variant: 'critical' },
];
export type ProgressSize = 'sm' | 'md' | 'lg';

/**
 * Reusable progress bar component.
 *
 * Sizes  (track height):
 *   sm  — 3 px  → used inside compact table cells (stock fill, runout %)
 *   md  — 6 px  → standard use (food-cost margin, SLA)
 *   lg  — 10 px → dashboard KPI cards
 *
 * Variants map to status color tokens:
 *   success  → $status-ready (teal)
 *   warning  → $status-pending (amber)
 *   critical → $status-canceled (red)
 *   info     → $status-in-preparation (blue)
 *   neutral  → --color-text-secondary (muted)
 *
 * Usage:
 *   <app-progress-bar [value]="68.6" variant="success" size="sm" label="68.6% margin" [showValue]="true" />
 */
@Component({
  selector: 'app-progress-bar',
  standalone: true,
  templateUrl: './progress-bar.html',
  styleUrl: './progress-bar.scss',
  host: {
    class: 'progress-bar-host',
    '[class]': '"progress-bar-host variant-" + effectiveVariant() + " size-" + size()',
    role: 'progressbar',
    '[attr.aria-valuenow]': 'clampedValue()',
    '[attr.aria-valuemin]': '0',
    '[attr.aria-valuemax]': '100',
    '[attr.aria-label]': 'ariaLabel() || label() || null',
    '[attr.aria-valuetext]': 'clampedValue() + "%"',
  },
})
export class ProgressBar {
  /** Progress value 0–100 */
  value = input<number>(0);

  /**
   * Color variant — maps to status color tokens.
   * Defaults to `'auto'`, which picks success / warning / critical
   * based on the current value using {@link AUTO_THRESHOLDS}.
   */
  variant = input<ProgressVariant>('auto');

  /** Track height: sm (3px) | md (6px) | lg (10px) */
  size = input<ProgressSize>('md');

  /** Optional text label rendered above the bar */
  label = input<string>('');

  /** When true, renders the numeric percentage next to the label */
  showValue = input<boolean>(false);

  /** Accessible label override (defaults to `label` if omitted) */
  ariaLabel = input<string>('');

  readonly clampedValue = computed(() => Math.min(100, Math.max(0, this.value())));
  readonly fillPercent = computed(() => `${this.clampedValue()}%`);

  /** Resolves `'auto'` variant to a concrete color variant based on the current value. */
  readonly effectiveVariant = computed((): ProgressVariant => {
    if (this.variant() !== 'auto') return this.variant();
    const v = this.clampedValue();
    return AUTO_THRESHOLDS.find((t) => v >= t.min)!.variant;
  });
}
