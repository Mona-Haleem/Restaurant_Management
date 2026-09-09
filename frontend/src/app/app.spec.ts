import { render, screen } from '@testing-library/angular';
import { App } from './app';
//import { provideRouter } from '@angular/router';
//import { CartService } from './core/services/cart/cart.service';
//import { signal } from '@angular/core';

describe('App', () => {
  it('should create the app', async () => {
    // const mockCartService = {
    //   cartCount: signal(0),
    // };

    await render(App, {
      //   providers: [provideRouter([]), { provide: CartService, useValue: mockCartService }],
    });
    expect(screen.getByText('tablz')).toBeTruthy();
    // expect(container).toBeTruthy();
  });
});
