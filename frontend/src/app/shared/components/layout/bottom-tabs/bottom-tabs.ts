import { Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavLink } from '../nav-bar/nav-bar';

@Component({
  selector: 'app-bottom-tabs',
  imports: [MatIcon, RouterLink, RouterLinkActive],
  templateUrl: './bottom-tabs.html',
  styleUrl: './bottom-tabs.scss',
  host: {
    role: 'nav',
  },
})
export class BottomTabs {
  links = input.required<NavLink[]>();
  active = input();
  count = 2;
}
