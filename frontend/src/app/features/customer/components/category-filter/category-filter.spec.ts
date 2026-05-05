import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { CategoryFilter } from './category-filter';
import { MenuService } from '../../../../core/services/menu/menu.service';
import { of } from 'rxjs';

describe('CategoryFilter', () => {
  let fixture: ComponentFixture<CategoryFilter>;
  let component: CategoryFilter;
  let menuServiceMock: Partial<MenuService>;

  function createComponent(categories: string[], activeCategory: string = '') {
    menuServiceMock = {
      getCategories: vi.fn().mockReturnValue(of(categories)),
      setActiveFilter: vi.fn(),
      get selectedCategory() { return activeCategory; },
    };

    TestBed.overrideProvider(MenuService, { useValue: menuServiceMock });

    fixture = TestBed.createComponent(CategoryFilter);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryFilter],
      providers: [{ provide: MenuService, useValue: {} }],
    }).compileComponents();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('should create the component', () => {
    createComponent(['Pizza', 'Burger']);
    expect(component).toBeTruthy();
  });

  it('should render a button for each category including "All"', () => {
    createComponent(['Pizza', 'Dessert']);

    const buttons = fixture.debugElement.queryAll(By.css('button'));
    expect(buttons.length).toBe(3); // All + Pizza + Dessert
    expect(buttons[0].nativeElement.textContent.trim()).toBe('All');
    expect(buttons[1].nativeElement.textContent.trim()).toBe('Pizza');
    expect(buttons[2].nativeElement.textContent.trim()).toBe('Dessert');
  });

  it('should apply "btn-primary" class only to the active category button', () => {
    createComponent(['Drinks', 'Mains'], 'Drinks');

    const buttons = fixture.debugElement.queryAll(By.css('button'));
    // buttons[0] = "All", buttons[1] = "Drinks"
    expect(buttons[0].nativeElement.classList.contains('btn-primary')).toBe(false);
    expect(buttons[1].nativeElement.classList.contains('btn-primary')).toBe(true);
  });

  // ── Interaction ────────────────────────────────────────────────────────────

  it('should call setActiveFilter with the category name when a category button is clicked', () => {
    createComponent(['Pasta', 'Salad']);

    const buttons = fixture.debugElement.queryAll(By.css('button'));
    buttons[1].nativeElement.click(); // "Pasta"
    fixture.detectChanges();

    expect(menuServiceMock.setActiveFilter).toHaveBeenCalledWith({ category: 'Pasta' });
  });

  it('should call setActiveFilter with empty string when "All" button is clicked', () => {
    createComponent(['Pasta', 'Salad'], 'Pasta');

    const buttons = fixture.debugElement.queryAll(By.css('button'));
    buttons[0].nativeElement.click(); // "All"
    fixture.detectChanges();

    expect(menuServiceMock.setActiveFilter).toHaveBeenCalledWith({ category: '' });
  });
});
