import { Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface NavLink {
  label: string;
  route: string;
  icon?: string;
}

@Component({
  selector: 'app-nav-bar, nav[app-nav]',
  imports: [MatIcon, RouterLink, RouterLinkActive],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
  host: {
    role: 'nav',
  },
})
export class NavBar {
  links = input.required<NavLink[]>();
  active = input();
}
