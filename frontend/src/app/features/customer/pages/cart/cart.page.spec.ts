import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CartPage } from './cart.page';
import { CartService } from '../../../../core/services/cart/cart.service';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { CartItem } from '../../../../core/models';

describe('CartPage', () => {
  let component: CartPage;
  let fixture: ComponentFixture<CartPage>;
  let cartServiceStub: Partial<CartService>;
  let cartItemsSubject: BehaviorSubject<CartItem[]>;

  const mockItem: CartItem = {
    _id: 'item-1',
    name: 'Burger',
    description: 'Classic beef burger',
    imageUrl: 'burger.jpg',
    price: 75,
    quantity: 2,
    category: 'Burgers',
    isAvailable: true,
    ingredients: [],
    addtions: []
  };

  function setupStub(items: CartItem[]) {
    cartItemsSubject = new BehaviorSubject<CartItem[]>(items);
    cartServiceStub = {
      get cartItems$() { return cartItemsSubject.asObservable(); },
      get count() { return of(items.length); },
      getCartSummary: vi.fn().mockReturnValue(of({
        subtotal: 0, itemDiscount: 0, couponDiscount: 0,
        serviceFee: 0, tax: 0, total: 0
      })),
      addToCart: vi.fn(),
      removeFromCart: vi.fn(),
      removeItem: vi.fn()
    };
  }

  async function createComponent() {
    await TestBed.configureTestingModule({
      imports: [CartPage],
      providers: [
        { provide: CartService, useValue: cartServiceStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CartPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ── Empty State ─────────────────────────────────────────────────────────

  describe('when cart is empty', () => {
    beforeEach(async () => {
      setupStub([]);
      await createComponent();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should render the empty cart message using [data-testid="empty-cart"]', () => {
      const emptyEl = fixture.debugElement.query(By.css('[data-testid="empty-cart"]'));
      expect(emptyEl).toBeTruthy();
      expect(emptyEl.nativeElement.textContent).toContain('Your cart is empty');
    });

    it('should NOT render any cart items', () => {
      const items = fixture.debugElement.queryAll(By.css('[data-testid="cart-item"]'));
      expect(items.length).toBe(0);
    });

    it('should NOT render the order summary when cart is empty', () => {
      const summary = fixture.debugElement.query(By.css('[data-testid="order-summary"]'));
      expect(summary).toBeFalsy();
    });
  });

  // ── Populated State ──────────────────────────────────────────────────────

  describe('when cart has items', () => {
    beforeEach(async () => {
      setupStub([mockItem, { ...mockItem, _id: 'item-2', name: 'Pizza', quantity: 1 }]);
      await createComponent();
    });

    it('should render one cart item per item in the cart', () => {
      const items = fixture.debugElement.queryAll(By.css('[data-testid="cart-item"]'));
      expect(items.length).toBe(2);
    });

    it('should NOT render the empty cart message', () => {
      const emptyEl = fixture.debugElement.query(By.css('[data-testid="empty-cart"]'));
      expect(emptyEl).toBeFalsy();
    });

    it('should render the order summary component when cart has items', () => {
      const summary = fixture.debugElement.query(By.css('[data-testid="order-summary"]'));
      expect(summary).toBeTruthy();
    });

    it('should reactively add an item when cartItems$ emits a new list', () => {
      let items = fixture.debugElement.queryAll(By.css('[data-testid="cart-item"]'));
      expect(items.length).toBe(2);

      // Emit a third item
      cartItemsSubject.next([
        mockItem,
        { ...mockItem, _id: 'item-2', name: 'Pizza', quantity: 1 },
        { ...mockItem, _id: 'item-3', name: 'Salad', quantity: 1 }
      ]);
      fixture.detectChanges();

      items = fixture.debugElement.queryAll(By.css('[data-testid="cart-item"]'));
      expect(items.length).toBe(3);
    });

    it('should reactively remove all items when cart is cleared', () => {
      let items = fixture.debugElement.queryAll(By.css('[data-testid="cart-item"]'));
      expect(items.length).toBe(2);

      cartItemsSubject.next([]);
      fixture.detectChanges();

      items = fixture.debugElement.queryAll(By.css('[data-testid="cart-item"]'));
      expect(items.length).toBe(0);

      const emptyEl = fixture.debugElement.query(By.css('[data-testid="empty-cart"]'));
      expect(emptyEl).toBeTruthy();
    });
  });
});
