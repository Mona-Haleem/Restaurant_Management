import { Routes } from '@angular/router';

// import { menuResolver } from './resolvers/menu.resolver';
// import { orderTrackingResolver } from './resolvers/order-tracking.resolver';
// import { cartResolver } from './resolvers/cart.resolver';
// import { ordersHistoryResolver } from './resolvers/orders-history.resolver';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'menu',
    pathMatch: 'full',
  },
  {
    path: 'menu',
    loadComponent: () => import('./screens/menu-page/menu-page').then((m) => m.MenuPage),
    //    resolve: { menuData: menuResolver },
  },
  {
    path: 'cart',
    loadComponent: () => import('./screens/cart-page/cart-page').then((m) => m.CartPage),
    // resolve: { cartData: cartResolver },
  },
  {
    path: 'checkout',
    loadComponent: () =>
      import('./screens/checkout-page/checkout-page').then((m) => m.CheckoutPage),
    //  resolve: { cartData: cartResolver },
  },
  {
    path: 'order/:id',
    loadComponent: () => import('./screens/orders-page/orders-page').then((m) => m.OrdersPage),
    //    resolve: { orders: ordersHistoryResolver },
  },
  {
    path: 'orders',
    loadComponent: () =>
      import('./screens/order-history-page/order-history-page').then((m) => m.OrderHistoryPage),
    //  resolve: { orders: orderTrackingResolver },
  },
];
