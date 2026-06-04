import { Routes } from '@angular/router';
import { MenuPage } from './pages/menu/menu.page';
import { NotFound } from '../../shared/components/not-found/not-found';
import { CartPage } from './pages/cart/cart.page';
import { CheckoutPage } from './pages/checkout/checkout.page';
import { OrderTrackingPage } from './pages/order-tracking/order-tracking.page';
import { menuResolver } from './resolvers/menu.resolver';
import { orderTrackingResolver } from './resolvers/order-tracking.resolver';
import { cartResolver } from './resolvers/cart.resolver';
import { ordersHistoryResolver } from './resolvers/orders-history.resolver';

export const customerRoutes: Routes = [
  {
    path: '',
    redirectTo: 'menu',
    pathMatch: 'full'
  },
  {
    path: 'menu',
    component: MenuPage,
    resolve: { menuData: menuResolver },
  },
  {
    path: 'cart',
    component: CartPage,
    resolve: { cartData: cartResolver }
  },
  {
    path: 'checkout',
    component: CheckoutPage,
    resolve: { cartData: cartResolver }
  },
  {
    path: 'order/:id',
    component: NotFound,
    resolve: { orders: ordersHistoryResolver }
  },
  {
    path: 'orders',
    component: OrderTrackingPage,
    resolve: { orders: orderTrackingResolver },
  },
  {
    path: 'profile',
    component: NotFound,
  },
];
