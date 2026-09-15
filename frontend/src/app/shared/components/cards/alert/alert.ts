import { Component, booleanAttribute, computed, input, model } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

export type AlertSeverity = 'critical' | 'medium' | 'warning' | 'audit' | 'info';
export type AlertHeadingLevel = 2 | 3 | 4 | 5 | 6;

/** Module-level counter used to generate unique ids per Alert instance,
 *  so aria-describedby / aria-controls references never collide when
 *  several alerts are rendered on the same page. */
let nextAlertId = 0;

@Component({
  selector: 'app-alert,section[app-alert], article[app-alert]',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './alert.html',
  styleUrl: './alert.scss',
  host: {
    '[class]': "'alert-' + normalizedSeverity()",
    '[class.is-expanded]': 'expanded()',
    '[class.is-collapsible]': 'collapsible()',
    // 'alert' triggers an assertive live-region announcement; that's only
    // appropriate for urgent severities. Lower-urgency alerts use 'status'
    // (polite) so screen reader users aren't interrupted unnecessarily.
    '[attr.role]': 'liveRole()',
    '[attr.aria-live]': "liveRole() === 'alert' ? 'assertive' : 'polite'",
    '[attr.aria-atomic]': 'true',
    // Lead with the severity so it's announced before the title, then
    // reference the description/metric text so the full context is
    // available to assistive tech, not just the heading.
    '[attr.aria-label]': "computedBadge() + ': ' + title()",
    '[attr.aria-describedby]': 'ariaDescribedBy()',
  },
})
export class Alert {
  /** Alert severity variant */
  readonly severity = input<AlertSeverity>('critical');

  /** Primary alert title */
  readonly title = input.required<string>();

  /** Optional descriptive subtitle */
  readonly description = input<string>();

  /** Optional highlighted metric text (e.g. 'Ingredient depletion 3.2×...') */
  readonly metric = input<string>();

  /** Optional metadata / station / timestamp (e.g. 'Oct 24, 19:45 · Wood Hearth Station #02') */
  readonly meta = input<string>();

  /** Optional badge text override (defaults based on severity) */
  readonly badge = input<string>();

  /** Optional icon override (defaults based on severity) */
  readonly icon = input<string>();

  /** Whether the detailed log section can be collapsed / expanded */
  readonly collapsible = input(false, { transform: booleanAttribute });

  /** Two-way bindable expanded state */
  readonly expanded = model(false);

  /** Label for expand button */
  readonly expandLabel = input<string>('Expand Log');

  /** Label for collapse button */
  readonly collapseLabel = input<string>('Collapse Log');

  /** Optional variance / investigation explanation text */
  readonly explanation = input<string>();

  /** Optional SKU pill tags (e.g. ['SKU: RAW-9814 (EVOO)', 'SKU: RAW-1102 (Dough)']) */
  readonly skus = input<string[]>();

  /** Optional collapsed single-action button label (e.g. 'Investigate Incident') */
  readonly actionLabel = input<string>();

  /** Heading level for the alert title (default h3). Let consumers match the
   *  surrounding page's heading hierarchy instead of forcing h3 everywhere. */
  readonly headingLevel = input<AlertHeadingLevel>(3);

  /** Unique id suffix for this instance, used to wire up aria-describedby /
   *  aria-controls without colliding with other alerts on the page. */
  private readonly uid = `alert-${nextAlertId++}`;
  readonly detailsId = `${this.uid}-details`;
  readonly descriptionId = `${this.uid}-description`;
  readonly metricId = `${this.uid}-metric`;

  /** Normalized severity ('warning' maps to 'medium') */
  readonly normalizedSeverity = computed(() => {
    const s = this.severity();
    return s === 'warning' ? 'medium' : s;
  });

  /** Auto-computed badge label based on severity unless overridden */
  readonly computedBadge = computed(() => {
    if (this.badge()) return this.badge();
    switch (this.normalizedSeverity()) {
      case 'critical':
        return 'HIGH CRITICAL';
      case 'medium':
        return 'MEDIUM SEVERITY';
      case 'audit':
        return 'AUDIT WARNING';
      case 'info':
        return 'INFO';
      default:
        return 'ALERT';
    }
  });

  /** Auto-computed icon name based on severity unless overridden */
  readonly computedIcon = computed(() => {
    if (this.icon()) return this.icon();
    switch (this.normalizedSeverity()) {
      case 'critical':
        return 'error';
      case 'medium':
        return 'flag';
      case 'audit':
        return 'assignment';
      case 'info':
        return 'info';
      default:
        return 'warning';
    }
  });

  /** 'alert' (assertive) for urgent severities, 'status' (polite) otherwise */
  readonly liveRole = computed(() => {
    const s = this.normalizedSeverity();
    return s === 'critical' || s === 'medium' ? 'alert' : 'status';
  });

  /** Ids of the visible description/metric text, so the host's
   *  aria-describedby exposes them even though aria-label overrides the
   *  accessible name to just the title. */
  readonly ariaDescribedBy = computed(() => {
    const ids: string[] = [];
    if (this.metric()) ids.push(this.metricId);
    if (this.description()) ids.push(this.descriptionId);
    return ids.length ? ids.join(' ') : null;
  });

  /** Determines whether details box has content to render */
  readonly hasDetails = computed(() => {
    return Boolean(this.explanation()) || (this.skus() && this.skus()!.length > 0);
  });

  toggleExpand(): void {
    if (!this.collapsible()) return;
    this.expanded.set(!this.expanded());
  }
}
