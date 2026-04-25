import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CategoryFilter } from './category-filter';

describe('CategoryFilter', () => {
  let fixture: ComponentFixture<CategoryFilter>;
  let component: CategoryFilter;

  function setCategories(categories: string[], activeCategory: string = '') {
    component.categories = categories;
    component.activeCategory = activeCategory;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryFilter],
    }).compileComponents();

    fixture = TestBed.createComponent(CategoryFilter);
    component = fixture.componentInstance;
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it('should create the component', () => {
    setCategories(['Pizza', 'Burger']);
    expect(component).toBeTruthy();
  });

  it('should render a button for each category including "All"', () => {
    // "All" is typically injected or handled in the component
    setCategories(['Pizza', 'Dessert']);

    const buttons = fixture.debugElement.queryAll(By.css('button'));
    expect(buttons.length).toBe(3); // All, Pizza, Dessert
    expect(buttons[0].nativeElement.textContent.trim()).toBe('All');
    expect(buttons[1].nativeElement.textContent.trim()).toBe('Pizza');
    expect(buttons[2].nativeElement.textContent.trim()).toBe('Dessert');
  });

  it('should apply the "active" class to the currently active category', () => {
    setCategories(['Drinks', 'Mains'], 'Drinks');

    const buttons = fixture.debugElement.queryAll(By.css('button'));
    // buttons[0] is "All", buttons[1] is "Drinks"
    expect(buttons[0].nativeElement.classList.contains('btn-primary')).toBe(false);
    expect(buttons[1].nativeElement.classList.contains('btn-primary')).toBe(true);
  });

  // ── @Output / Interaction ─────────────────────────────────────────────────

  it('should emit the selected category and update activeCategory when a button is clicked', () => {
    setCategories(['Pasta', 'Salad'], 'All');

    const emitSpy = vi.spyOn(component.categorySelected, 'emit');
    const buttons = fixture.debugElement.queryAll(By.css('button'));

    // Click the "Pasta" button
    buttons[1].nativeElement.click();
    fixture.detectChanges();

    expect(emitSpy).toHaveBeenCalledWith('Pasta');
    expect(component.activeCategory).toBe('Pasta');
    expect(buttons[1].nativeElement.classList.contains('btn-primary')).toBe(true);
  });

  it('should emit empty string when "All" button is clicked', () => {
    setCategories(['Pasta', 'Salad'], 'Pasta');

    const emitSpy = vi.spyOn(component.categorySelected, 'emit');
    const buttons = fixture.debugElement.queryAll(By.css('button'));

    // Click the "All" button
    buttons[0].nativeElement.click();
    fixture.detectChanges();

    expect(emitSpy).toHaveBeenCalledWith('');
    expect(component.activeCategory).toBe('');
    expect(buttons[0].nativeElement.classList.contains('btn-primary')).toBe(true);
  });
});
