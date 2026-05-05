import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MenuPage } from './menu.page';
import { MenuService } from '../../../../core/services/menu/menu.service';
import { CartService } from '../../../../core/services/cart/cart.service';
import { of, BehaviorSubject } from 'rxjs';
import { CategoryFilter } from '../../components/category-filter/category-filter';
import { MenuGrid } from '../../components/menu-grid/menu-grid';
import { CartSidebar } from '../../components/cart-sidebar/cart-sidebar';

describe('MenuPage', () => {
  let fixture: ComponentFixture<MenuPage>;
  let component: MenuPage;

  // Since child components inject services directly, we mock at the service level
  const menuServiceStub = {
    getCategories: vi.fn().mockReturnValue(of(['Pizza', 'Burger'])),
    getItems: vi.fn().mockReturnValue(of([
      { _id: '1', name: 'Pizza', category: 'Pizza', price: 10, isAvailable: true }
    ])),
    getActiveFilterItems: vi.fn().mockReturnValue(of([
      { _id: '1', name: 'Pizza', category: 'Pizza', price: 10, isAvailable: true }
    ])),
    setActiveFilter: vi.fn(),
    get selectedCategory() { return ''; },
  };

  const cartServiceStub = {
    cartItems$: new BehaviorSubject([]).asObservable(),
    get total() { return of(0); },
    get count() { return of(0); },
    addToCart: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuPage],
      providers: [
        { provide: MenuService, useValue: menuServiceStub },
        { provide: CartService, useValue: cartServiceStub },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MenuPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the page', () => {
    expect(component).toBeTruthy();
  });

  it('should render the layout: CategoryFilter, MenuGrid, and CartSidebar', () => {
    const filter = fixture.debugElement.query(By.directive(CategoryFilter));
    const grid = fixture.debugElement.query(By.directive(MenuGrid));
    const cart = fixture.debugElement.query(By.directive(CartSidebar));

    expect(filter).toBeTruthy();
    expect(grid).toBeTruthy();
    expect(cart).toBeTruthy();
  });
});
