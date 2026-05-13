import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavBar } from './nav-bar';
import { CartService } from '../../../core/services/cart/cart.service';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { provideRouter } from '@angular/router';

describe('NavBar', () => {
  let component: NavBar;
  let fixture: ComponentFixture<NavBar>;
  let cartServiceMock: Partial<CartService>;
  let cartCountSubject: BehaviorSubject<number>;

  beforeEach(async () => {
    cartCountSubject = new BehaviorSubject<number>(0);

    cartServiceMock = {
      get count() {
        return cartCountSubject.asObservable();
      },
    };

    await TestBed.configureTestingModule({
      imports: [NavBar],
      providers: [
        { provide: CartService, useValue: cartServiceMock },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavBar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the NavBar component', () => {
    expect(component).toBeTruthy();
  });

  it('should display the brand logo or name', () => {
    const brandEl = fixture.debugElement.query(By.css('[data-testid="brand-logo"]'));
    expect(brandEl).toBeTruthy();
    expect(brandEl.nativeElement.textContent.trim().length).toBeGreaterThan(0);
  });

  it('should have a navigation link to the Menu page', () => {
    const menuLink = fixture.debugElement.query(By.css('[data-testid="nav-menu"]'));
    expect(menuLink).toBeTruthy();
    expect(menuLink.attributes['routerLink']).toBe('/menu');
  });

  it('should have a navigation link to the Order Tracking/History page', () => {
    const ordersLink = fixture.debugElement.query(By.css('[data-testid="nav-orders"]'));
    expect(ordersLink).toBeTruthy();
    expect(ordersLink.attributes['routerLink']).toBe('/orders');
  });

  it('should have a Cart button that navigates to the cart page', () => {
    const cartLink = fixture.debugElement.query(By.css('[data-testid="nav-cart"]'));
    expect(cartLink).toBeTruthy();
    expect(cartLink.attributes['routerLink']).toBe('/cart');
  });

  it('should display the correct cart item count badge from CartService', () => {
    // Initial count is 0, badge might be hidden or show 0 depending on implementation.
    // Let's test with a positive number.
    cartCountSubject.next(5);
    fixture.detectChanges();

    const badgeEl = fixture.debugElement.query(By.css('[data-testid="cart-badge"]'));
    expect(badgeEl).toBeTruthy();
    expect(badgeEl.nativeElement.textContent.trim()).toBe('5');

    // Update count
    cartCountSubject.next(12);
    fixture.detectChanges();
    expect(badgeEl.nativeElement.textContent.trim()).toBe('9+');
  });
});
