import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MenuCard } from './menu-card';
import { MenuItem } from '../../../../../../core/models';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal valid MenuItem — override any field you need per test */
function buildMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    _id: 'item-1',
    name: 'Margherita Pizza',
    description: 'Classic tomato and mozzarella',
    price: 12.99,
    category: 'Pizza',
    isAvailable: true,
    ingredients: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MenuCard', () => {
  let fixture: ComponentFixture<MenuCard>;
  let component: MenuCard;

  /**
   * Helper: set the @Input() item and trigger change detection so the
   * template reflects the new value before we query the DOM.
   */
  function setItem(item: MenuItem) {
    component.item = item;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuCard], // standalone — import the component itself
    }).compileComponents();

    fixture = TestBed.createComponent(MenuCard);
    component = fixture.componentInstance;
    // Do NOT call detectChanges yet — each test sets its own input first
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it('should create the component', () => {
    setItem(buildMenuItem());
    expect(component).toBeTruthy();
  });

  it('should display the menu item name', () => {
    setItem(buildMenuItem({ name: 'Pepperoni Pizza' }));
    const el = fixture.debugElement.query(By.css('[data-testid="item-name"]'));
    expect(el.nativeElement.textContent).toContain('Pepperoni Pizza');
  });

  it('should display the menu item description', () => {
    setItem(buildMenuItem({ description: 'Loaded with pepperoni slices' }));
    const el = fixture.debugElement.query(By.css('[data-testid="item-description"]'));
    expect(el.nativeElement.textContent).toContain('Loaded with pepperoni slices');
  });

  it('should display the menu item category', () => {
    setItem(buildMenuItem({ category: 'Starters' }));
    const el = fixture.debugElement.query(By.css('[data-testid="item-category"]'));
    expect(el.nativeElement.textContent).toContain('Starters');
  });

  it('should display the price formatted as currency', () => {
    setItem(buildMenuItem({ price: 8.5 }));
    const el = fixture.debugElement.query(By.css('[data-testid="item-price"]'));
    // CurrencyPipe formats 8.5 → "$8.50" (default locale en-US)
    expect(el.nativeElement.textContent).toContain('8.50');
  });

  // ── Availability ─────────────────────────────────────────────────────────

  it('should show an available badge when isAvailable is true', () => {
    setItem(buildMenuItem({ isAvailable: true }));
    const badge = fixture.debugElement.query(By.css('[data-testid="available-badge"]'));
    expect(badge).toBeTruthy();
  });

  it('should NOT show an available badge when isAvailable is false', () => {
    setItem(buildMenuItem({ isAvailable: false }));
    const badge = fixture.debugElement.query(By.css('[data-testid="available-badge"]'));
    expect(badge).toBeNull();
  });

  it('should show an unavailable badge when isAvailable is false', () => {
    setItem(buildMenuItem({ isAvailable: false }));
    const badge = fixture.debugElement.query(By.css('[data-testid="unavailable-badge"]'));
    expect(badge).toBeTruthy();
  });

  it('should disable the Add to Cart button when item is unavailable', () => {
    setItem(buildMenuItem({ isAvailable: false }));
    const btn = fixture.debugElement.query(By.css('[data-testid="add-to-cart-btn"]'));
    expect(btn.nativeElement.disabled).toBe(true);
  });

  // ── @Output / Interaction ─────────────────────────────────────────────────

  // it('should emit the menu item when the Add to Cart button is clicked', () => {
  //   const item = buildMenuItem({ name: 'Caesar Salad', isAvailable: true });
  //   setItem(item);

  //   // Spy on the EventEmitter
  //   const emitSpy = vi.spyOn(component.addToCart, 'emit');

  //   const btn = fixture.debugElement.query(By.css('[data-testid="add-to-cart-btn"]'));
  //   btn.nativeElement.click();

  //   expect(emitSpy).toHaveBeenCalledTimes(1);
  //   expect(emitSpy).toHaveBeenCalledWith(item);
  // });

  // it('should NOT emit when the Add to Cart button is clicked on an unavailable item', () => {
  //   const item = buildMenuItem({ isAvailable: false });
  //   setItem(item);

  //   const emitSpy = vi.spyOn(component.addToCart, 'emit');
  //   const btn = fixture.debugElement.query(By.css('[data-testid="add-to-cart-btn"]'));
  //   btn.nativeElement.click(); // button is disabled, click should be ignored

  //   expect(emitSpy).not.toHaveBeenCalled();
  // });

  it('should call cartService.addToCart when the Add to Cart button is clicked', () => {
    const item = buildMenuItem({ name: 'Caesar Salad', isAvailable: true });
    setItem(item);

    // Spy on the service method
    const addToCartSpy = vi.spyOn(component.cartService, 'addToCart');

    const btn = fixture.debugElement.query(By.css('[data-testid="add-to-cart-btn"]'));
    btn.nativeElement.click();

    expect(addToCartSpy).toHaveBeenCalledTimes(1);
    expect(addToCartSpy).toHaveBeenCalledWith(item);
  });

  it('should NOT call cartService.addToCart when the Add to Cart button is clicked on an unavailable item', () => {
    const item = buildMenuItem({ isAvailable: false });
    setItem(item);

    const addToCartSpy = vi.spyOn(component.cartService, 'addToCart');
    const btn = fixture.debugElement.query(By.css('[data-testid="add-to-cart-btn"]'));
    btn.nativeElement.click(); // button is disabled, click should be ignored

    expect(addToCartSpy).not.toHaveBeenCalled();
  });
});
