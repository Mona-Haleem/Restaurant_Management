import { render, screen } from '@testing-library/angular';
import { NavBar } from './nav-bar';
import { CartService } from '../../../core/services/cart/cart.service';
import { BehaviorSubject } from 'rxjs';
import { provideRouter } from '@angular/router';

describe('NavBar', () => {
  let cartCountSubject: BehaviorSubject<number>;

  const setup = async () => {
    cartCountSubject = new BehaviorSubject<number>(0);
    const cartServiceMock = {
      get count() {
        return cartCountSubject.asObservable();
      },
    };

    return await render(NavBar, {
      providers: [{ provide: CartService, useValue: cartServiceMock }, provideRouter([])],
    });
  };

  it('should display the brand logo or name', async () => {
    await setup();
    expect(screen.getByTestId('brand-logo')).toBeTruthy();
  });

  it('should render navigation links for Menu, Order, and Cart', async () => {
    await setup();
    expect(screen.getByTestId('nav-menu')).toBeTruthy();
    expect(screen.getByTestId('nav-orders')).toBeTruthy();
    expect(screen.getByTestId('nav-cart')).toBeTruthy();
  });

  it('should display the correct cart item count badge from CartService', async () => {
    const { detectChanges } = await setup();

    cartCountSubject.next(5);
    detectChanges();
    expect(screen.getByTestId('cart-badge')).toBeTruthy();
    expect(screen.getByTestId('cart-badge').textContent?.trim()).toBe('5');

    cartCountSubject.next(12);
    detectChanges();
    expect(screen.getByTestId('cart-badge').textContent?.trim()).toBe('9+');
  });
});
