import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth-guard/auth-guard';
import { roleGuard } from '../../core/guards/role-guard/role-guard';

// import { menuResolver } from './resolvers/menu.resolver';
// import { orderTrackingResolver } from './resolvers/order-tracking.resolver';
// import { cartResolver } from './resolvers/cart.resolver';
// import { ordersHistoryResolver } from './resolvers/orders-history.resolver';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./screens/layout/layout').then((m) => m.Layout),
    children: [
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
        canActivate: [authGuard, roleGuard],
        data: { roles: ['customer'] },
        //  resolve: { cartData: cartResolver },
      },
      {
        path: 'order/:id',
        loadComponent: () => import('./screens/orders-page/orders-page').then((m) => m.OrdersPage),
        canActivate: [authGuard, roleGuard],
        data: { roles: ['customer'] },
        //    resolve: { orders: ordersHistoryResolver },
      },
      {
        path: 'orders',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['customer'] },
        loadComponent: () =>
          import('./screens/order-history-page/order-history-page').then((m) => m.OrderHistoryPage),
        //  resolve: { orders: orderTrackingResolver },
      },
    ],
  },
];
