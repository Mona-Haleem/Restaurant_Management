import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OrderCard } from './order-card';
import { ComponentRef } from '@angular/core';
import { Order } from '../../../../../core/models';

describe('OrderCard', () => {
  let component: OrderCard;
  let componentRef: ComponentRef<OrderCard>;
  let fixture: ComponentFixture<OrderCard>;

  const mockOrder: Order = {
    _id: '999888',
    userId: 'user-1',
    type: 'dine-in',
    location: 10,
    status: 'DELIVERED',
    items: [
      {
        _id: 'item-2',
        name: 'Pizza',
        description: 'Cheese Pizza',
        imageUrl: 'pizza.png',
        price: 150,
        quantity: 1,
        category: 'Pizza',
        isAvailable: true,
        ingredients: [],
        addtions: ['Extra Cheese']
      }
    ],
    totalPrice: 150,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderCard]
    }).compileComponents();

    fixture = TestBed.createComponent(OrderCard);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    
    componentRef.setInput('order', { ...mockOrder });
    fixture.detectChanges();
  });

  // ── Basic Rendering & Values ─────────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the order ID using [data-testid="order-id"]', () => {
    const idEl = fixture.debugElement.query(By.css('[data-testid="order-id"]')).nativeElement;
    expect(idEl.textContent).toContain('#999888');
  });

  it('should render the order items summary using [data-testid="order-items"]', () => {
    const itemsEl = fixture.debugElement.query(By.css('[data-testid="order-items"]')).nativeElement;
    // Expected from the getter: ['Pizza x1']
    expect(itemsEl.textContent).toContain('Pizza x1');
  });

  it('should render the expected time using [data-testid="order-eta"]', () => {
    const etaEl = fixture.debugElement.query(By.css('[data-testid="order-eta"]')).nativeElement;
    expect(etaEl.textContent).toContain('30 minutes');
  });

  it('should render the order status using [data-testid="order-status"]', () => {
    const statusEl = fixture.debugElement.query(By.css('[data-testid="order-status"]')).nativeElement;
    expect(statusEl.textContent).toContain('DELIVERED');
  });

  // ── Order Type Specific Logic ────────────────────────────────────────────

  it('should display table_restaurant icon and "TABLE {location}" for dine-in orders', () => {
    // Current is 'dine-in' from beforeEach
    const iconEl = fixture.debugElement.query(By.css('[data-testid="type-icon"]')).nativeElement;
    expect(iconEl.textContent.trim()).toBe('table_restaurant');

    const typeTextEl = fixture.debugElement.query(By.css('[data-testid="order-type"]')).nativeElement;
    expect(typeTextEl.textContent).toContain('TABLE 10');
  });

  it('should display takeout_dining icon and "pickup" for pickup orders', () => {
    componentRef.setInput('order', { ...mockOrder, type: 'pickup', location: 'pickup' });
    fixture.detectChanges();

    const iconEl = fixture.debugElement.query(By.css('[data-testid="type-icon"]')).nativeElement;
    expect(iconEl.textContent.trim()).toBe('takeout_dining');

    const typeTextEl = fixture.debugElement.query(By.css('[data-testid="order-type"]')).nativeElement;
    expect(typeTextEl.textContent).toContain('pickup');
  });

  it('should display local_shipping icon and "delivery" for delivery orders', () => {
    componentRef.setInput('order', { ...mockOrder, type: 'delivery', location: '123 Main St' });
    fixture.detectChanges();

    const iconEl = fixture.debugElement.query(By.css('[data-testid="type-icon"]')).nativeElement;
    expect(iconEl.textContent.trim()).toBe('local_shipping');

    const typeTextEl = fixture.debugElement.query(By.css('[data-testid="order-type"]')).nativeElement;
    expect(typeTextEl.textContent).toContain('delivery');
  });
});
