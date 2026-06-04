import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { PaymentForm } from './payment-form';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

describe('PaymentForm', () => {
  let component: PaymentForm;
  let fixture: ComponentFixture<PaymentForm>;
  let cartServiceStub: Partial<CartService>;
  let couponSubject: BehaviorSubject<any>;

  beforeEach(async () => {
    couponSubject = new BehaviorSubject(null);
    cartServiceStub = {
      applyCoupon: vi.fn(),
      removeCoupon: vi.fn(),
      get coupon$() { return couponSubject.asObservable(); }
    };

    await TestBed.configureTestingModule({
      imports: [PaymentForm, FormsModule],
      providers: [
        { provide: CartService, useValue: cartServiceStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ── Defaults & Initialization ──────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default to "cash" payment method', () => {
    expect(component.paymentMethod).toBe('cash');
    
    // Should NOT show card inputs initially
    const cardNumberInput = fixture.debugElement.query(By.css('input[name="cardNumber"]'));
    expect(cardNumberInput).toBeFalsy();
  });

  it('should emit methodChange on init with default payment method', () => {
    const emitSpy = vi.spyOn(component.methodChange, 'emit');
    // Call ngOnInit explicitly because it might have run before spy was attached
    component.ngOnInit();
    expect(emitSpy).toHaveBeenCalledWith('cash');
  });

  // ── Interaction: Payment Method ────────────────────────────────────────

  it('should update payment method to "card" and show card inputs', () => {
    const cardBox = fixture.debugElement.query(By.css('.payment-box:nth-child(2)'));
    const emitSpy = vi.spyOn(component.methodChange, 'emit');
    
    cardBox.nativeElement.click();
    fixture.detectChanges();

    expect(component.paymentMethod).toBe('card');
    expect(emitSpy).toHaveBeenCalledWith('card');
    
    // Should show card inputs
    const cardNumberInput = fixture.debugElement.query(By.css('input[name="cardNumber"]'));
    expect(cardNumberInput).toBeTruthy();
  });

  it('should update payment method back to "cash" and hide card inputs', () => {
    component.paymentMethod = 'card';
    fixture.detectChanges();
    
    const cashBox = fixture.debugElement.query(By.css('.payment-box:nth-child(1)'));
    cashBox.nativeElement.click();
    fixture.detectChanges();

    expect(component.paymentMethod).toBe('cash');
    const cardNumberInput = fixture.debugElement.query(By.css('input[name="cardNumber"]'));
    expect(cardNumberInput).toBeFalsy();
  });

  // ── Coupon Logic ───────────────────────────────────────────────────────

  it('should not call CartService if applyCoupon is triggered with empty/whitespace code', () => {
    component.couponCode = '   ';
    component.applyCoupon();
    expect(cartServiceStub.applyCoupon).not.toHaveBeenCalled();
  });

  it('should show an error if CartService rejects the coupon code', () => {
    (cartServiceStub.applyCoupon as any).mockReturnValue(false);
    
    component.couponCode = 'INVALID';
    component.applyCoupon();
    fixture.detectChanges();

    expect(cartServiceStub.applyCoupon).toHaveBeenCalledWith('INVALID');
    expect(component.couponError).toBe('Invalid coupon code');
    
    // Code should remain in input so user can fix it
    expect(component.couponCode).toBe('INVALID');
    
    // Error should be displayed in the template
    const errorEl = fixture.debugElement.query(By.css('.error-text'));
    expect(errorEl.nativeElement.textContent).toContain('Invalid coupon');
  });

  it('should clear error and input if CartService accepts the coupon', () => {
    (cartServiceStub.applyCoupon as any).mockReturnValue(true);
    component.couponError = 'Some old error';
    component.couponCode = 'VALIDCODE';
    
    component.applyCoupon();
    
    expect(cartServiceStub.applyCoupon).toHaveBeenCalledWith('VALIDCODE');
    expect(component.couponError).toBe('');
    expect(component.couponCode).toBe(''); // Clear input after success
  });

  it('should display the applied coupon and a remove button', () => {
    couponSubject.next({ code: 'SAVE20', discountPercent: 20 });
    fixture.detectChanges();

    const appliedEl = fixture.debugElement.query(By.css('.applied-coupon'));
    expect(appliedEl).toBeTruthy();
    expect(appliedEl.nativeElement.textContent).toContain('SAVE20');
    expect(appliedEl.nativeElement.textContent).toContain('20% OFF');
  });

  it('should call CartService.removeCoupon when the remove button is clicked', () => {
    couponSubject.next({ code: 'SAVE20', discountPercent: 20 });
    fixture.detectChanges();

    const removeBtn = fixture.debugElement.query(By.css('.applied-coupon button'));
    removeBtn.nativeElement.click();

    expect(cartServiceStub.removeCoupon).toHaveBeenCalledTimes(1);
  });

  // ── Emitting Data ──────────────────────────────────────────────────────

  it('should emit only the method when submitting as "cash"', () => {
    const submitSpy = vi.spyOn(component.submit, 'emit');
    component.paymentMethod = 'cash';
    
    component.onSubmit();

    expect(submitSpy).toHaveBeenCalledWith({ method: 'cash' });
  });

  it('should emit method and card details when submitting as "card"', async () => {
    const submitSpy = vi.spyOn(component.submit, 'emit');
    
    // Set method to card so inputs are rendered
    component.paymentMethod = 'card';
    fixture.detectChanges();
    await fixture.whenStable();

    // Fill the inputs via UI to test bindings too
    const holderInput = fixture.debugElement.query(By.css('input[name="cardHolder"]')).nativeElement;
    const numberInput = fixture.debugElement.query(By.css('input[name="cardNumber"]')).nativeElement;
    const expiryInput = fixture.debugElement.query(By.css('input[name="expiry"]')).nativeElement;
    const cvvInput = fixture.debugElement.query(By.css('input[name="cvv"]')).nativeElement;

    holderInput.value = 'Jane Doe';
    holderInput.dispatchEvent(new Event('input'));
    
    numberInput.value = '4111222233334444';
    numberInput.dispatchEvent(new Event('input'));

    expiryInput.value = '12/25';
    expiryInput.dispatchEvent(new Event('input'));

    cvvInput.value = '123';
    cvvInput.dispatchEvent(new Event('input'));

    fixture.detectChanges();
    
    const formElement = fixture.debugElement.query(By.css('form'));
    formElement.triggerEventHandler('ngSubmit', null);

    expect(submitSpy).toHaveBeenCalledWith({
      method: 'card',
      cardHolder: 'Jane Doe',
      cardNumber: '4111222233334444',
      expiry: '12/25',
      cvv: '123'
    });
  });
});
