import { Component, inject } from '@angular/core';
import { MenuService } from '../../../../core/services/menu/menu.service';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-category-filter',
  imports: [AsyncPipe],
  templateUrl: './category-filter.html',
  styleUrl: './category-filter.scss',
})
export class CategoryFilter {
  private itemsService = inject(MenuService)
  categories = this.itemsService.getCategories();
  get activeCategory() {
    return this.itemsService.selectedCategory;
  };

  onCategoryClick(category: string) {
    this.itemsService.setActiveFilter({ category });
  }

}
