import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-category-filter',
  imports: [],
  templateUrl: './category-filter.html',
  styleUrl: './category-filter.scss',
})
export class CategoryFilter {
  @Input({ required: true }) categories!: string[];
  @Input({ required: true }) activeCategory: string = 'all';
  @Output() categorySelected = new EventEmitter<string>();

  onCategoryClick(category: string) {
    this.activeCategory = category;
    this.categorySelected.emit(category);
  }

}
