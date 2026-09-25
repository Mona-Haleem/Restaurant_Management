import { Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { resolveStatusConfig, type StatusConfig } from './status-badge.config';

@Component({
  selector: 'app-status-badge, [status-badge]',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.scss',
  host: {
    role: 'status',
    '[class]': "'status-' + activeClass()",
  },
})
export class StatusBadge {
  stageKey = input<string | null | undefined>('');

  label = input<string | null | undefined>(undefined);

  showIcon = input<boolean>(true);

  icon = input<string | null | undefined>(undefined);

  readonly statusConfig = computed<StatusConfig>(() => {
    return resolveStatusConfig(this.stageKey());
  });
  readonly activeClass = computed<string>(() => {
    return this.statusConfig().statusClass;
  });

  readonly displayedLabel = computed<string>(() => {
    const override = this.label();
    if (override !== undefined && override !== null && override !== '') {
      return override;
    }
    return this.statusConfig().label;
  });

  readonly displayedIcon = computed<string>(() => {
    const override = this.icon();
    if (override !== undefined && override !== null && override !== '') {
      return override;
    }
    return this.statusConfig().icon;
  });
}
