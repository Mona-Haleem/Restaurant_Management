import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CheckoutPage } from './checkout.page';
import { CartService } from '../../../../core/services/cart/cart.service';
import { OrderService } from '../../../../core/services/order/order.service';
import { Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { CartItem } from '../../../../core/models';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('CheckoutPage', () => {
  let component: CheckoutPage;
  let fixture: ComponentFixture<CheckoutPage>;
  let cartServiceStub: Partial<CartService>;
  let orderServiceStub: Partial<OrderService>;
  let routerStub: Partial<Router>;
  let cartItemsSubject: BehaviorSubject<CartItem[]>;

  const mockCartItems: CartItem[] = [
    {
      _id: 'item-1',
      name: 'Burger',
      price: 50,
      quantity: 2,
      category: 'Burgers',
      isAvailable: true,
      ingredients: [],
      addtions: [],
      description: ""
    }
  ];

  beforeEach(async () => {
    cartItemsSubject = new BehaviorSubject<CartItem[]>(mockCartItems);

    cartServiceStub = {
      get cartItems$() { return cartItemsSubject.asObservable(); },
      getCart: vi.fn().mockReturnValue(mockCartItems),
      getCartSummary: vi.fn().mockReturnValue(of({ subtotal: 100, itemDiscount: 0, couponDiscount: 0, serviceFee: 10, tax: 5, total: 115 })),
      clearCart: vi.fn()
    };

    orderServiceStub = {
      placeOrder: vi.fn().mockReturnValue(of({ _id: 'order-123' }))
    };

    routerStub = {
      navigate: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CheckoutPage], // CheckoutPage is standalone
      providers: [
        { provide: CartService, useValue: cartServiceStub },
        { provide: OrderService, useValue: orderServiceStub },
        { provide: Router, useValue: routerStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CheckoutPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ── Initialization & State ─────────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with currentStep 0 and paymentMethod cash', () => {
    expect(component.currentStep).toBe(0);
    expect(component.paymentMethod).toBe('cash');
  });

  it('should render customer data form at step 0', () => {
    component.currentStep = 0;
    fixture.detectChanges();
    const customerForm = fixture.debugElement.query(By.css('app-customer-data-form'));
    expect(customerForm).toBeTruthy();

    const paymentForm = fixture.debugElement.query(By.css('app-payment-form'));
    expect(paymentForm).toBeFalsy();
  });

  // ── Step Navigation & Event Handlers ─────────────────────────────────────

  it('should update customerData when onCustomerData is called', () => {
    const mockData = {
      fullName: 'John',
      phone: '123',
      delivery_address: '',
      location: 5,
      type: 'dine-in' as const,
      paymentMethod: "cash",

    };
    component.onCustomerData(mockData);
    expect(component.customerData).toEqual(mockData);
  });

  it('should update paymentMethod when onPaymentMethodChange is called', () => {
    component.onPaymentMethodChange('card');
    expect(component.paymentMethod).toBe('card');
  });

  it('should unlock steps when onStepChange is called', () => {
    // Initially steps 1 and 2 are locked
    expect(component.steps[1].isLocked).toBe(true);
    expect(component.steps[2].isLocked).toBe(true);

    component.onStepChange(1); // Moving to step 1

    expect(component.steps[1].isLocked).toBe(false);
    // Step 2 should remain locked
    expect(component.steps[2].isLocked).toBe(true);
  });

  // ── Order Placement ──────────────────────────────────────────────────────

  it('should not place order if cart is empty', () => {
    (cartServiceStub.getCart as any).mockReturnValue([]);

    component.onPlaceOrder();

    expect(orderServiceStub.placeOrder).not.toHaveBeenCalled();
    expect(routerStub.navigate).not.toHaveBeenCalled();
  });

  it('should place order with dine-in location and navigate on success', () => {
    component.customerData = {
      fullName: 'John', phone: '123', delivery_address: '',
      location: 12, type: 'dine-in',
      paymentMethod: "cash",

    };

    component.onPlaceOrder();

    expect(orderServiceStub.placeOrder).toHaveBeenCalledWith(mockCartItems, 'dine-in', 12);
    expect(cartServiceStub.clearCart).toHaveBeenCalledTimes(1);
    expect(routerStub.navigate).toHaveBeenCalledWith(['/customer/order'], { queryParams: { id: 'order-123' } });
  });

  it('should place order with delivery location', () => {
    component.customerData = {
      fullName: 'Jane', phone: '456', delivery_address: 'Home St',
      location: null, type: 'delivery',
      paymentMethod: "cash",

    };

    component.onPlaceOrder();

    expect(orderServiceStub.placeOrder).toHaveBeenCalledWith(mockCartItems, 'delivery', 'Home St');
  });

  it('should place order with pickup location', () => {
    component.customerData = {
      fullName: 'Bob', phone: '789', delivery_address: '',
      location: null, type: 'pickup',
      paymentMethod: "cash",

    };

    component.onPlaceOrder();

    expect(orderServiceStub.placeOrder).toHaveBeenCalledWith(mockCartItems, 'pickup', 'pickup');
  });

  it('should default to dine-in and table 1 if customerData is missing', () => {
    component.customerData = undefined;

    component.onPlaceOrder();

    expect(orderServiceStub.placeOrder).toHaveBeenCalledWith(mockCartItems, 'dine-in', 1);
  });

  // ── Review Step Rendering ────────────────────────────────────────────────

  it('should render review details at step 2', () => {
    component.currentStep = 2;
    component.paymentMethod = 'card';
    component.customerData = {
      fullName: 'Alice', phone: '111222', delivery_address: '',
      location: 4, type: 'dine-in',
      paymentMethod: "cash",

    };
    fixture.detectChanges();

    const reviewGrid = fixture.debugElement.query(By.css('.review-grid')).nativeElement;
    expect(reviewGrid.textContent).toContain('Alice');
    expect(reviewGrid.textContent).toContain('111222');
    expect(reviewGrid.textContent).toContain('dine-in');
    expect(reviewGrid.textContent).toContain('TABLE 4');
    expect(reviewGrid.textContent).toContain('card');
  });
});
