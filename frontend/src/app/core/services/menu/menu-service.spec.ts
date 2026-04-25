import { TestBed } from '@angular/core/testing';
import { MenuService } from './menu.service';
import { firstValueFrom } from 'rxjs';

// The tests expect DUMMY_ITEMS and DUMMY_CATEGORIES to be used internally by the service
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
    // We expect the service to wrap the dummy data in an RxJS Observable using `of()`
    // This prepares us for real HTTP calls later!
    const categories$ = service.getCategories();

    // firstValueFrom is a modern RxJS function to turn an Observable into a Promise for testing
    const categories = await firstValueFrom(categories$);

    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0); // Assuming DUMMY_CATEGORIES is not empty
  });

  it('should return menu items as an Observable', async () => {
    const items$ = service.getItems();
    const items = await firstValueFrom(items$);

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0); // Assuming DUMMY_ITEMS is not empty
  });

  it('should return items filtered by category', async () => {
    // Assuming 'Italian' exists in your DUMMY_CATEGORIES
    const items$ = service.getItems('Italian');
    const items = await firstValueFrom(items$);

    expect(Array.isArray(items)).toBe(true);
    // Every item returned should have the category 'Italian'
    expect(items.every(item => item.category === 'Italian')).toBe(true);
  });
});
