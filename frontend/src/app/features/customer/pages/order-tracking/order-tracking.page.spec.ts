import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OrderTrackingPage } from './order-tracking.page';
import { ComponentRef } from '@angular/core';
import { Order } from '../../../../core/models';
import { provideRouter } from '@angular/router';

describe('OrderTrackingPage', () => {
  let component: OrderTrackingPage;
  let componentRef: ComponentRef<OrderTrackingPage>;
  let fixture: ComponentFixture<OrderTrackingPage>;

  const mockActiveOrder: Order = {
    _id: 'active-1',
    userId: 'u1',
    type: 'dine-in',
    location: 1,
    status: 'PENDING',
    items: [],
    totalPrice: 100,
    createdBy: 'system',
    createdAt: new Date('2026-05-20T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-05-20T10:00:00Z').toISOString()
  };

  const mockDeliveredOrder: Order = {
    _id: 'delivered-1',
    userId: 'u1',
    type: 'dine-in',
    location: 1,
    status: 'DELIVERED',
    items: [],
    totalPrice: 150,
    createdBy: 'system',
    createdAt: new Date('2026-05-19T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-05-19T11:00:00Z').toISOString()
  };

  const mockCanceledOrder: Order = {
    _id: 'canceled-1',
    userId: 'u1',
    type: 'dine-in',
    location: 1,
    status: 'CANCELED',
    items: [],
    totalPrice: 50,
    createdBy: 'system',
    createdAt: new Date('2026-05-18T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-05-18T10:30:00Z').toISOString()
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderTrackingPage],
      providers: [provideRouter([])] // needed for routerLink in template
    }).compileComponents();

    fixture = TestBed.createComponent(OrderTrackingPage);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
  });

  // ── Empty State ─────────────────────────────────────────────────────────

  it('should render "Order Not Found" state when orders array is empty', () => {
    componentRef.setInput('orders', []);
    fixture.detectChanges();
    // call ngOnInit to run the sorting/assignment logic
    component.ngOnInit();
    fixture.detectChanges();

    const notFoundEl = fixture.debugElement.query(By.css('[data-testid="not-found"]'));
    expect(notFoundEl).toBeTruthy();
    expect(notFoundEl.nativeElement.textContent).toContain('Order Not Found');

    const trackerCards = fixture.debugElement.queryAll(By.css('[data-testid="tracker-card"]'));
    const historyCards = fixture.debugElement.queryAll(By.css('[data-testid="history-card"]'));
    expect(trackerCards.length).toBe(0);
    expect(historyCards.length).toBe(0);
  });

  // ── Active vs Historical Rendering ───────────────────────────────────────

  it('should render OrderTrackerCard for active orders (PENDING, IN_PREPARATION, READY)', () => {
    componentRef.setInput('orders', [mockActiveOrder]);
    component.ngOnInit();
    fixture.detectChanges();

    const trackerCards = fixture.debugElement.queryAll(By.css('[data-testid="tracker-card"]'));
    const historyCards = fixture.debugElement.queryAll(By.css('[data-testid="history-card"]'));

    expect(trackerCards.length).toBe(1);
    expect(historyCards.length).toBe(0);
  });

  it('should render OrderCard for historical orders (DELIVERED, CANCELED)', () => {
    componentRef.setInput('orders', [mockDeliveredOrder, mockCanceledOrder]);
    component.ngOnInit();
    fixture.detectChanges();

    const trackerCards = fixture.debugElement.queryAll(By.css('[data-testid="tracker-card"]'));
    const historyCards = fixture.debugElement.queryAll(By.css('[data-testid="history-card"]'));

    expect(trackerCards.length).toBe(0);
    expect(historyCards.length).toBe(2);
  });

  it('should render both appropriately when a mix of orders is provided', () => {
    componentRef.setInput('orders', [mockActiveOrder, mockDeliveredOrder]);
    component.ngOnInit();
    fixture.detectChanges();

    const trackerCards = fixture.debugElement.queryAll(By.css('[data-testid="tracker-card"]'));
    const historyCards = fixture.debugElement.queryAll(By.css('[data-testid="history-card"]'));

    expect(trackerCards.length).toBe(1);
    expect(historyCards.length).toBe(1);
  });

  // ── Sorting Logic ────────────────────────────────────────────────────────

  it('should sort orders primarily by status index, and secondarily by createdAt (newest first)', () => {
    const activeOrder2: Order = {
      ...mockActiveOrder,
      _id: 'active-2',
      createdAt: new Date('2026-05-20T12:00:00Z').toISOString() // Newer than active-1
    };

    // Provide unsorted
    componentRef.setInput('orders', [mockDeliveredOrder, mockActiveOrder, activeOrder2]);
    component.ngOnInit();

    // active-2 is newest PENDING
    // active-1 is older PENDING
    // delivered-1 is DELIVERED
    // PENDING < DELIVERED in OrderStatusList
    expect(component.orderHistory[0]._id).toBe('active-2');
    expect(component.orderHistory[1]._id).toBe('active-1');
    expect(component.orderHistory[2]._id).toBe('delivered-1');
  });
});
