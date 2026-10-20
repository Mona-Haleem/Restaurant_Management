import { Component, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NavLink } from '../nav-bar/nav-bar';
import { isActive } from '../../../helpers/route_check';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-bottom-tabs',
  imports: [MatIcon, RouterLink, TranslocoPipe],
  templateUrl: './bottom-tabs.html',
  styleUrl: './bottom-tabs.scss',
  host: {
    role: 'navigation',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class BottomTabs {
  links = input.required<NavLink[]>();
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService, { optional: true });

  ariaLabel = toSignal(this.transloco!.selectTranslate('navigation.bottomNav'), {
    initialValue: 'Bottom navigation',
  });

  isActive(route: string) {
    return isActive(route, this.router);
  }
}
