import { TestBed } from '@angular/core/testing';
import { MenuService } from './menu.service';
import { firstValueFrom } from 'rxjs';

describe('MenuService', () => {
  let service: MenuService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MenuService);
  });

  it('should be created in the root injector', () => {
    expect(service).toBeTruthy();
  });

  it('should return categories as an Observable', async () => {
    const categories = await firstValueFrom(service.getCategories());
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('should return menu items via filteredItems signal', () => {
    const items = service.filteredItems();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it('should return items filtered by category', () => {
    service.setActiveFilter({ category: 'Italian' });
    const items = service.filteredItems();
    expect(Array.isArray(items)).toBe(true);
    expect(items.every((item) => item.category === 'Italian')).toBe(true);
  });

  // ── Active filter state ─────────────────────────────────────────────────

  it('should initialize with an empty selectedCategory', () => {
    expect(service.selectedCategory()).toBe('');
  });

  it('should update selectedCategory when setActiveFilter is called', () => {
    service.setActiveFilter({ category: 'Pizza' });
    expect(service.selectedCategory()).toBe('Pizza');
  });

  it('should reset selectedCategory to empty when setActiveFilter is called with empty string', () => {
    service.setActiveFilter({ category: 'Pizza' });
    service.setActiveFilter({ category: '' });
    expect(service.selectedCategory()).toBe('');
  });
});
