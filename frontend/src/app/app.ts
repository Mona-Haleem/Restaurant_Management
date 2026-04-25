import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuGrid } from './features/customer/components/menu-grid/menu-grid';
import { DUMMY_ITEMS } from './core/DummyData/item';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MenuGrid],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('frontend');
  items = DUMMY_ITEMS;

}
