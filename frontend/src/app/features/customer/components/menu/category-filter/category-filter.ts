import { Component, inject, Input } from '@angular/core';
import { MenuService } from '../../../../../core/services/menu/menu.service';


@Component({
  selector: 'app-category-filter',
  imports: [],
  templateUrl: './category-filter.html',
  styleUrl: './category-filter.scss',
})
export class CategoryFilter {
  private itemsService = inject(MenuService)

  @Input() categories: string[] = [];

  get activeCategory() {
    return this.itemsService.selectedCategory;
  };

  onCategoryClick(category: string) {
    this.itemsService.setActiveFilter({ category });
  }

}
