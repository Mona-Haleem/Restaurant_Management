import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CartSidebar } from './cart-sidebar';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { BehaviorSubject, of } from 'rxjs';
import { CartItem } from '../../../../../core/models';
import { OrderService } from '../../../../../core/services/order/order.service';
import { vi } from 'vitest';

describe('CartSidebar', () => {
  let fixture: ComponentFixture<CartSidebar>;
  let component: CartSidebar;
  let cartServiceStub: Partial<CartService>;
  let orderServiceStub: Partial<OrderService>;

  // We mock the service's state so we can control what the component sees
  const mockCartItems$ = new BehaviorSubject<CartItem[]>([]);

  beforeEach(async () => {
    // 1. Create a dummy version of CartService
    cartServiceStub = {
      cartItems$: mockCartItems$.asObservable(),
      get total() { return of(15); },
      removeFromCart: vi.fn(),
      clearCart: vi.fn(),
      getCart: vi.fn().mockReturnValue([]),
      getCartSummary: vi.fn().mockReturnValue({ subtotal: 50, itemDiscount: 0, couponDiscount: 0, serviceFee: 10, tax: 10, total: 66 })
    };

    orderServiceStub = {
      placeOrder: vi.fn().mockReturnValue(of({}))
    };

    // 2. Configure the testing module to USE our stub whenever someone asks for CartService
    await TestBed.configureTestingModule({
      imports: [CartSidebar],
      providers: [
        { provide: CartService, useValue: cartServiceStub },
        { provide: OrderService, useValue: orderServiceStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CartSidebar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should display "Your cart is empty" when there are no items', () => {
    mockCartItems$.next([]);
    fixture.detectChanges(); // Tell Angular to update the HTML

    const emptyMsg = fixture.debugElement.query(By.css('[data-testid="empty-cart-msg"]'));
    expect(emptyMsg).toBeTruthy();
    expect(emptyMsg.nativeElement.textContent).toContain('empty');
  });

  it('should render a list of cart items when the cart has items', () => {
    mockCartItems$.next([
      { _id: '1', name: 'Pizza', description: '', price: 10, category: 'Main', isAvailable: true, ingredients: [], quantity: 1 },
      { _id: '2', name: 'Cola', description: '', price: 5, category: 'Drinks', isAvailable: true, ingredients: [], quantity: 2 }
    ]);
    fixture.detectChanges();

    const itemRows = fixture.debugElement.queryAll(By.css('[data-testid="cart-item-row"]'));
    expect(itemRows.length).toBe(2);

    // Verify binding works using the async pipe
    expect(itemRows[0].nativeElement.textContent).toContain('Pizza');
    expect(itemRows[1].nativeElement.textContent).toContain('Cola');
  });

  it('should display the total price correctly', () => {
    // Note: total is a getter on your service, returning 15 in our stub
    const totalEl = fixture.debugElement.query(By.css('[data-testid="cart-total"]'));
    expect(totalEl.nativeElement.textContent).toContain('15');
  });

  // ── Interaction ─────────────────────────────────────────────────────────

  it('should call service.removeFromCart when the remove button is clicked', () => {
    mockCartItems$.next([
      { _id: '1', name: 'Pizza', description: '', price: 10, category: 'Main', isAvailable: true, ingredients: [], quantity: 1 }
    ]);
    fixture.detectChanges();

    const removeBtn = fixture.debugElement.query(By.css('[data-testid="remove-item-btn"]'));
    removeBtn.nativeElement.click();

    expect(cartServiceStub.removeFromCart).toHaveBeenCalledWith('1');
  });

  it('should call service.clearCart when the clear button is clicked', () => {
    mockCartItems$.next([
      { _id: '1', name: 'Pizza', description: '', price: 10, category: 'Main', isAvailable: true, ingredients: [], quantity: 1 }
    ]);
    fixture.detectChanges();

    const clearBtn = fixture.debugElement.query(By.css('[data-testid="clear-cart-btn"]'));
    clearBtn.nativeElement.click();

    expect(cartServiceStub.clearCart).toHaveBeenCalledTimes(1);
  });

  it('should call orderService.placeOrder and cartService.clearCart when checkout is clicked', async () => {
    // Setup a cart with items
    const testItems: CartItem[] = [
      { _id: '1', name: 'Pizza', description: '', price: 10, category: 'Main', isAvailable: true, ingredients: [], quantity: 1 }
    ];
    mockCartItems$.next(testItems);
    // Mock getCart to return the items, as the component might use it
    (cartServiceStub.getCart as any).mockReturnValue(testItems);

    fixture.detectChanges();

    const checkoutBtn = fixture.debugElement.query(By.css('[data-testid="checkout-btn"]'));
    checkoutBtn.nativeElement.click();

    await fixture.whenStable();

    // Verify order was placed (pickup as default for now or whatever you choose to implement)
    expect(orderServiceStub.placeOrder).toHaveBeenCalledWith(testItems, 'pickup');

    // Verify cart was cleared after order placement
    expect(cartServiceStub.clearCart).toHaveBeenCalledTimes(1);
  });
});
