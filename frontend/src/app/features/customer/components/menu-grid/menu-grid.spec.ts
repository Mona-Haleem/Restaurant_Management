import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { MenuGrid } from './menu-grid';
import { MenuCard } from './menu-card/menu-card';
import { MenuItem } from '../../../../core/models';
import { MenuService } from '../../../../core/services/menu/menu.service';
import { of } from 'rxjs';

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
  let menuServiceMock: Partial<MenuService>;

  function createComponent(items: MenuItem[], activeCategory: string = '') {
    menuServiceMock = {
      getItems: vi.fn().mockReturnValue(of(items)),
      getActiveFilterItems: vi.fn().mockReturnValue(of(items)),
      get selectedCategory() { return activeCategory; },
    };

    TestBed.overrideProvider(MenuService, { useValue: menuServiceMock });

    fixture = TestBed.createComponent(MenuGrid);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuGrid, MenuCard],
      providers: [{ provide: MenuService, useValue: {} }],
    }).compileComponents();
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it('should create the component', () => {
    createComponent([]);
    expect(component).toBeTruthy();
  });

  it('should render an app-menu-card for each item returned by the service', () => {
    createComponent(buildMenuItems());

    const cards = fixture.debugElement.queryAll(By.css('app-menu-card'));
    expect(cards.length).toBe(3);
  });

  it('should pass the correct item to each MenuCard', () => {
    const items = buildMenuItems();
    createComponent(items);

    const cards = fixture.debugElement.queryAll(By.directive(MenuCard));
    expect(cards.length).toBe(3);

    const firstCardInstance = cards[0].componentInstance as MenuCard;
    expect(firstCardInstance.item).toEqual(items[0]);

    const secondCardInstance = cards[1].componentInstance as MenuCard;
    expect(secondCardInstance.item).toEqual(items[1]);
  });

  it('should display a "No items found" message when the service returns an empty array', () => {
    createComponent([]);

    const emptyMessage = fixture.debugElement.query(
      By.css('[data-testid="empty-grid-msg"]')
    );
    expect(emptyMessage).toBeTruthy();
    expect(emptyMessage.nativeElement.textContent).toContain('No items found');
  });

  // ── Service integration ───────────────────────────────────────────────────

  it('should refetch items when current selectedCategory is changed', () => {
    createComponent(buildMenuItems(), 'Main');
    expect(menuServiceMock.getActiveFilterItems).toHaveBeenCalled();
  });
});
