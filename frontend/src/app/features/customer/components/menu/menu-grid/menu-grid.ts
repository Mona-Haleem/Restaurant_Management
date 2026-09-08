import { Component, inject, Input } from '@angular/core';
import { MenuCard } from './menu-card/menu-card';
import { AsyncPipe } from '@angular/common';
import { MenuService } from '../../../../../core/services/menu/menu.service';
import { MenuItem } from '../../../../../core/models';

@Component({
  selector: 'app-menu-grid',
  imports: [MenuCard],
  templateUrl: './menu-grid.html',
  styleUrl: './menu-grid.scss',
})
export class MenuGrid {
  @Input({ required: true }) menu!: MenuItem[];
}
