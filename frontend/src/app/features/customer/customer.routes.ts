import { Routes } from '@angular/router';

export const customerRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/menu/menu.page').then((m) => m.MenuPage),
  },
  // {
  //   path: 'cart',
  //   loadComponent: () =>
  //     import('./pages/cart/cart.component').then((m) => m.CartComponent),
  // },
  // {
  //   path: 'checkout',
  //   loadComponent: () =>
  //     import('./pages/checkout/checkout.component').then((m) => m.CheckoutComponent),
  // },
  // {
  //   path: 'orders/:id',
  //   loadComponent: () =>
  //     import('./pages/order-tracking/order-tracking.component').then(
  //       (m) => m.OrderTrackingComponent
  //     ),
  // },
];
