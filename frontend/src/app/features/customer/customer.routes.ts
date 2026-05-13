import { Routes } from '@angular/router';
import { MenuPage } from './pages/menu/menu.page';
import { NotFound } from '../../shared/components/not-found/not-found';
import { CartPage } from './pages/cart/cart.page';
import { CheckoutPage } from './pages/checkout/checkout.page';
import { OrderTrackingPage } from './pages/order-tracking/order-tracking.page';

export const customerRoutes: Routes = [
  {
    path: '',
    redirectTo: 'menu',
    pathMatch: 'full'
  },
  {
    path: 'menu',
    component: MenuPage,
  },
  {
    path: 'cart',
    component: CartPage,
  },
  {
    path: 'checkout',
    component: CheckoutPage,
  },
  {
    path: 'order',
    component: OrderTrackingPage,
  },
  {
    path: 'profile',
    component:// ProfilePage,
      NotFound
  },
];
