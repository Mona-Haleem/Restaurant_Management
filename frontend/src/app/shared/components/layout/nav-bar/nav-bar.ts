import { Component, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { isActive } from '../../../helpers/route_check';
import { toSignal } from '@angular/core/rxjs-interop';

export interface NavLink {
  label: string;
  route: string;
  icon?: string;
}

@Component({
  selector: 'app-nav-bar, nav[app-nav]',
  imports: [MatIcon, RouterLink, TranslocoPipe],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
  host: {
    role: 'navigation',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class NavBar {
  links = input.required<NavLink[]>();
  router = inject(Router);
  private readonly transloco = inject(TranslocoService, { optional: true });

  ariaLabel = toSignal(this.transloco!.selectTranslate('navigation.mainNav'), {
    initialValue: 'Main navigation',
  });

  isActive(route: string) {
    return isActive(route, this.router);
  }
}
