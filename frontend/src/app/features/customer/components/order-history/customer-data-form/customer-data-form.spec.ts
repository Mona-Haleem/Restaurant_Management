import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { CustomerDataForm } from './customer-data-form';
import { vi } from 'vitest';

describe('CustomerDataForm', () => {
  let component: CustomerDataForm;
  let fixture: ComponentFixture<CustomerDataForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerDataForm, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerDataForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ── Creation & Defaults ──────────────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default to "dine-in" order destination', () => {
    expect(component.orderDestination).toBe('dine-in');
    
    const dineInBox = fixture.debugElement.query(By.css('.destination-box:nth-child(1)'));
    expect(dineInBox.classes['selected']).toBeTruthy();
    
    // Should show table number input initially
    const tableInput = fixture.debugElement.query(By.css('input[name="table_number"]'));
    expect(tableInput).toBeTruthy();
    
    // Should NOT show delivery address
    const deliveryInput = fixture.debugElement.query(By.css('input[name="delivery_address"]'));
    expect(deliveryInput).toBeFalsy();
  });

  // ── Interaction: Order Destination ──────────────────────────────────────

  it('should update order destination to "pickup" when clicked', () => {
    const pickupBox = fixture.debugElement.query(By.css('.destination-box:nth-child(2)'));
    pickupBox.nativeElement.click();
    fixture.detectChanges();

    expect(component.orderDestination).toBe('pickup');
    expect(pickupBox.classes['selected']).toBeTruthy();

    // Both table and delivery address inputs should be hidden
    const tableInput = fixture.debugElement.query(By.css('input[name="table_number"]'));
    const deliveryInput = fixture.debugElement.query(By.css('input[name="delivery_address"]'));
    
    expect(tableInput).toBeFalsy();
    expect(deliveryInput).toBeFalsy();
  });

  it('should update order destination to "delivery" when clicked and show address input', () => {
    const deliveryBox = fixture.debugElement.query(By.css('.destination-box:nth-child(3)'));
    deliveryBox.nativeElement.click();
    fixture.detectChanges();

    expect(component.orderDestination).toBe('delivery');
    expect(deliveryBox.classes['selected']).toBeTruthy();

    // Should hide table number, show delivery address
    const tableInput = fixture.debugElement.query(By.css('input[name="table_number"]'));
    const deliveryInput = fixture.debugElement.query(By.css('input[name="delivery_address"]'));
    
    expect(tableInput).toBeFalsy();
    expect(deliveryInput).toBeTruthy();
  });

  // ── Form Binding ───────────────────────────────────────────────────────

  it('should bind inputs to component properties via ngModel', async () => {
    const nameInput = fixture.debugElement.query(By.css('input[name="username"]')).nativeElement;
    const phoneInput = fixture.debugElement.query(By.css('input[name="phone"]')).nativeElement;
    
    nameInput.value = 'John Doe';
    nameInput.dispatchEvent(new Event('input'));
    
    phoneInput.value = '+123456789';
    phoneInput.dispatchEvent(new Event('input'));

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.fullName).toBe('John Doe');
    expect(component.phone).toBe('+123456789');
  });

  // ── Emitting Data ──────────────────────────────────────────────────────

  it('should emit the correct payload when onSubmit is called', () => {
    const emitSpy = vi.spyOn(component.submit, 'emit');
    
    component.fullName = 'Alice';
    component.phone = '987654321';
    component.orderDestination = 'delivery';
    component.delivery_address = '123 Main St';
    component.table_number = null;

    component.onSubmit();

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith({
      fullName: 'Alice',
      phone: '987654321',
      delivery_address: '123 Main St',
      table_number: null,
      type: 'delivery'
    });
  });

  it('should trigger onSubmit when the form is submitted', () => {
    const submitSpy = vi.spyOn(component, 'onSubmit');
    
    const formElement = fixture.debugElement.query(By.css('form'));
    formElement.triggerEventHandler('ngSubmit', null);
    
    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});
