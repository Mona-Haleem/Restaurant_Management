import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'orders',
    pathMatch: 'full',
  },
  {
    path: 'orders',
    loadComponent: () => import('./screens/orders-board/orders-board').then((m) => m.OrdersBoard),
  },
  // {
  //     path: 'orders/:id',
  //     loadComponent: () =>
  //         import('./screens/orders-board/orders-board').then(
  //             (m) => m.OrdersBoard
  //         ),
  // },

  // {
  //   path: 'waste',
  //   loadComponent: () =>
  //     import('./screens/waste-form/waste-form.component').then(
  //       (m) => m.WasteFormComponent
  //     ),
  // },
];
