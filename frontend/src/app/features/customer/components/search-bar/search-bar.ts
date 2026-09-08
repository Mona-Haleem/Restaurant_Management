import { Component, inject } from '@angular/core';
import { MenuService } from '../../../../core/services/menu/menu.service';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { MatIcon, MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-search-bar',
  imports: [MatIconModule],
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.scss',
})
export class SearchBar {
  searchSubject = new Subject<string>();

  menuService = inject(MenuService);

  constructor() {
    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe((query) => {
      this.menuService.setActiveFilter({ search: query });
    });
  }

  onSearch(value: string) {
    this.searchSubject.next(value);
  }
}
