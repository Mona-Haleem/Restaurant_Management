import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MenuGrid } from './menu-grid';
import { MenuCard } from '../menu-card/menu-card';
import { MenuItem } from '../../../../core/models';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMenuItems(): MenuItem[] {
  return [
    {
      _id: '1',
      name: 'Pizza',
      description: 'Cheese pizza',
      price: 10,
      category: 'Main',
      isAvailable: true,
      ingredients: [],
    },
    {
      _id: '2',
      name: 'Burger',
      description: 'Beef burger',
      price: 8,
      category: 'Main',
      isAvailable: false,
      ingredients: [],
    },
    {
      _id: '3',
      name: 'Salad',
      description: 'Fresh salad',
      price: 5,
      category: 'Starter',
      isAvailable: true,
      ingredients: [],
    },
  ];
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MenuGrid', () => {
  let fixture: ComponentFixture<MenuGrid>;
  let component: MenuGrid;

  function setItems(items: MenuItem[]) {
    component.items = items;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuGrid, MenuCard],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuGrid);
    component = fixture.componentInstance;
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it('should create the component', () => {
    setItems([]);
    expect(component).toBeTruthy();
  });

  it('should render an app-menu-card for each item in the @Input array', () => {
    const items = buildMenuItems();
    setItems(items);

    const cards = fixture.debugElement.queryAll(By.css('app-menu-card'));
    expect(cards.length).toBe(3);
  });

  it('should pass the correct item to each MenuCard', () => {
    const items = buildMenuItems();
    setItems(items);

    const cards = fixture.debugElement.queryAll(By.directive(MenuCard));
    expect(cards.length).toBe(3);

    // Verify first card gets the first item
    const firstCardInstance = cards[0].componentInstance as MenuCard;
    expect(firstCardInstance.item).toEqual(items[0]);

    // Verify second card gets the second item
    const secondCardInstance = cards[1].componentInstance as MenuCard;
    expect(secondCardInstance.item).toEqual(items[1]);
  });

  it('should display a "No items found" message if array is empty', () => {
    setItems([]);
    const emptyMessage = fixture.debugElement.query(By.css('[data-testid="empty-grid-msg"]'));
    expect(emptyMessage).toBeTruthy();
    expect(emptyMessage.nativeElement.textContent).toContain('No items found');
  });

  // ── @Output / Interaction ─────────────────────────────────────────────────

  it('should emit the item when a child MenuCard emits addToCart', () => {
    const items = buildMenuItems();
    setItems(items);

    // Spy on the MenuGrid's EventEmitter
    const emitSpy = vi.spyOn(component.addToCart, 'emit');

    const cards = fixture.debugElement.queryAll(By.directive(MenuCard));
    const firstCardInstance = cards[0].componentInstance as MenuCard;

    // Simulate the child component emitting
    firstCardInstance.addToCart.emit(items[0]);

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(items[0]);
  });
});
