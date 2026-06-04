import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OrderSummary } from './order-summary';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

describe('OrderSummary', () => {
  let component: OrderSummary;
  let fixture: ComponentFixture<OrderSummary>;
  let cartServiceStub: Partial<CartService>;
  let routerStub: Partial<Router>;
  let summarySubject: BehaviorSubject<any>;

  beforeEach(async () => {
    summarySubject = new BehaviorSubject({
      subtotal: 100,
      itemDiscount: 0,
      couponDiscount: 0,
      serviceFee: 10,
      tax: 5,
      total: 115
    });

    cartServiceStub = {
      getCartSummary: vi.fn().mockReturnValue(summarySubject.asObservable())
    };

    routerStub = {
      navigate: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [OrderSummary],
      providers: [
        { provide: CartService, useValue: cartServiceStub },
        { provide: Router, useValue: routerStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OrderSummary);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ── Rendering Summary Data ──────────────────────────────────────────────

  it('should render subtotal, service fee, tax, and total', () => {
    const textContent = fixture.nativeElement.textContent;
    expect(textContent).toContain('SUBTOTAL');
    expect(textContent).toContain('100.00'); 
    
    expect(textContent).toContain('SERVICE FEE');
    expect(textContent).toContain('10.00');
    
    expect(textContent).toContain('TAX (5%)');
    expect(textContent).toContain('5.00');
    
    expect(textContent).toContain('TOTAL AMOUNT');
    expect(textContent).toContain('115.00');
  });

  it('should NOT render discounts if they are 0', () => {
    const textContent = fixture.nativeElement.textContent;
    expect(textContent).not.toContain('ITEM SAVINGS');
    expect(textContent).not.toContain('COUPON DISCOUNT');
  });

  it('should render item savings if itemDiscount > 0', () => {
    summarySubject.next({ ...summarySubject.value, itemDiscount: 15.5 });
    fixture.detectChanges();

    const textContent = fixture.nativeElement.textContent;
    expect(textContent).toContain('ITEM SAVINGS');
    expect(textContent).toContain('15.50');
  });

  it('should render coupon discount if couponDiscount > 0', () => {
    summarySubject.next({ ...summarySubject.value, couponDiscount: 20 });
    fixture.detectChanges();

    const textContent = fixture.nativeElement.textContent;
    expect(textContent).toContain('COUPON DISCOUNT');
    expect(textContent).toContain('20.00');
  });

  // ── Button Label Logic ──────────────────────────────────────────────────
  // Note: One of these tests will likely fail until the bug in OrderSummary
  // (!this.currentStep === undefined) is fixed!

  it('should display "Checkout" as button label when currentStep is undefined', () => {
    fixture.componentRef.setInput('currentStep', undefined);
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('button.btn-primary'));
    expect(btn.nativeElement.textContent).toContain('Checkout');
  });

  it('should display "CONTINUE" as button label when currentStep is 0 or 1', () => {
    fixture.componentRef.setInput('currentStep', 0);
    fixture.detectChanges();
    let btn = fixture.debugElement.query(By.css('button.btn-primary'));
    expect(btn.nativeElement.textContent).toContain('CONTINUE');

    fixture.componentRef.setInput('currentStep', 1);
    fixture.detectChanges();
    btn = fixture.debugElement.query(By.css('button.btn-primary'));
    expect(btn.nativeElement.textContent).toContain('CONTINUE');
  });

  it('should display "PLACE ORDER" as button label when currentStep is 2', () => {
    fixture.componentRef.setInput('currentStep', 2);
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('button.btn-primary'));
    expect(btn.nativeElement.textContent).toContain('PLACE ORDER');
  });

  // ── Interaction: onPress() ──────────────────────────────────────────────

  it('should navigate to checkout when button is clicked and currentStep is undefined', () => {
    fixture.componentRef.setInput('currentStep', undefined);
    
    const btn = fixture.debugElement.query(By.css('button.btn-primary'));
    btn.nativeElement.click();

    expect(routerStub.navigate).toHaveBeenCalledWith(['customer', 'checkout']);
  });

  it('should increment currentStep and emit currentStepChange when button is clicked (step 0, 1)', () => {
    const emitSpy = vi.spyOn(component.currentStepChange, 'emit');
    
    fixture.componentRef.setInput('currentStep', 1);
    
    const btn = fixture.debugElement.query(By.css('button.btn-primary'));
    btn.nativeElement.click();

    expect(component.currentStep).toBe(2);
    expect(emitSpy).toHaveBeenCalledWith(2);
  });

  it('should emit placeOrder when button is clicked and currentStep is 2', () => {
    const emitSpy = vi.spyOn(component.placeOrder, 'emit');
    
    fixture.componentRef.setInput('currentStep', 2);
    
    const btn = fixture.debugElement.query(By.css('button.btn-primary'));
    btn.nativeElement.click();

    expect(emitSpy).toHaveBeenCalledTimes(1);
    // Should NOT navigate
    expect(routerStub.navigate).not.toHaveBeenCalled();
  });
});
