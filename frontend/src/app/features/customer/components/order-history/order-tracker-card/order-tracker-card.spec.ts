import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OrderTrackerCard } from './order-tracker-card';
import { ComponentRef } from '@angular/core';
import { Order } from '../../../../../core/models';
import { OrderService } from '../../../../../core/services/order/order.service';
import { vi } from 'vitest';

describe('OrderTrackerCard', () => {
  let component: OrderTrackerCard;
  let componentRef: ComponentRef<OrderTrackerCard>;
  let fixture: ComponentFixture<OrderTrackerCard>;
  let orderServiceStub: Partial<OrderService>;

  const mockOrder: Order = {
    _id: '12345',
    userId: 'user1',
    type: 'dine-in',
    location: 5,
    status: 'PENDING',
    items: [
      {
        _id: 'item1',
        name: 'Burger',
        description: 'A delicious burger',
        imageUrl: 'burger.jpg',
        price: 50,
        quantity: 2,
        category: 'Burgers',
        isAvailable: true,
        ingredients: [],
        addtions: ['Cheese']
      }
    ],
    totalPrice: 100,
    createdBy: 'user1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeEach(async () => {
    orderServiceStub = {
      cancelOrder: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [OrderTrackerCard],
      providers: [
        { provide: OrderService, useValue: orderServiceStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OrderTrackerCard);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    
    componentRef.setInput('order', { ...mockOrder });
    fixture.detectChanges();
  });

  // ── Initialization & Basic Rendering ─────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the order ID using the [data-testid="order-id"] selector', () => {
    const orderIdEl = fixture.debugElement.query(By.css('[data-testid="order-id"]')).nativeElement;
    expect(orderIdEl.textContent).toContain('#12345');
  });

  it('should render the estimated time of arrival using [data-testid="est-arrival"]', () => {
    const estArrivalEl = fixture.debugElement.query(By.css('[data-testid="est-arrival"]')).nativeElement;
    expect(estArrivalEl.textContent).toContain(component.estimatedTimeOfArrival);
  });

  it('should render the steps tracker component with mapped steps', () => {
    const stepsTrackerEl = fixture.debugElement.query(By.css('[data-testid="steps-tracker"]'));
    expect(stepsTrackerEl).toBeTruthy();
    
    // Check if currentStep is correctly calculated based on order status PENDING (index 0)
    expect(component.currentStep).toBe(0);
  });

  it('should calculate currentStep correctly for different order statuses', () => {
    componentRef.setInput('order', { ...mockOrder, status: 'IN_PREPARATION' });
    component.ngOnInit(); // Trigger initialization logic
    fixture.detectChanges();
    expect(component.currentStep).toBe(1);

    componentRef.setInput('order', { ...mockOrder, status: 'READY' });
    component.ngOnInit();
    fixture.detectChanges();
    expect(component.currentStep).toBe(2);
  });

  // ── Order Details & Pricing ──────────────────────────────────────────────

  it('should render order items summary using [data-testid="order-items"]', () => {
    const itemsEl = fixture.debugElement.query(By.css('[data-testid="order-items"]')).nativeElement;
    // We expect "Burger x2" because orderItems getter returns array of strings
    expect(itemsEl.textContent).toContain('Burger x2');
  });

  it('should render total price formatted correctly using [data-testid="total-price"]', () => {
    const priceEl = fixture.debugElement.query(By.css('[data-testid="total-price"]')).nativeElement;
    expect(priceEl.textContent).toContain('100.00');
  });

  // ── Conditional Actions (Cancel Button) ──────────────────────────────────

  it('should display the Cancel Order button ONLY when status is PENDING', () => {
    // Current status is PENDING from beforeEach
    let cancelBtn = fixture.debugElement.query(By.css('[data-testid="cancel-btn"]'));
    expect(cancelBtn).toBeTruthy();

    // Change status
    componentRef.setInput('order', { ...mockOrder, status: 'IN_PREPARATION' });
    fixture.detectChanges();

    cancelBtn = fixture.debugElement.query(By.css('[data-testid="cancel-btn"]'));
    expect(cancelBtn).toBeFalsy();
  });

  it('should call OrderService.cancelOrder when Cancel Order button is clicked', () => {
    const cancelBtn = fixture.debugElement.query(By.css('[data-testid="cancel-btn"]'));
    cancelBtn.nativeElement.click();

    expect(orderServiceStub.cancelOrder).toHaveBeenCalledWith('12345');
    expect(orderServiceStub.cancelOrder).toHaveBeenCalledTimes(1);
  });
});
