import { render } from '@testing-library/angular';
import { App } from './app';
import { provideRouter } from '@angular/router';
import { CartService } from './core/services/cart/cart.service';
import { signal } from '@angular/core';

describe('App', () => {
  it('should create the app', async () => {
    const mockCartService = {
      cartCount: signal(0),
    };

    const { container } = await render(App, {
      providers: [provideRouter([]), { provide: CartService, useValue: mockCartService }],
    });

    expect(container).toBeTruthy();
  });
});
