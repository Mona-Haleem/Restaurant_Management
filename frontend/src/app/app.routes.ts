import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'customer',
    pathMatch: 'full',
  },
  {
    path: 'customer',
    loadChildren: () =>
      import('./features/customer/customer.routes').then((m) => m.customerRoutes),
  },
  {
    path: 'worker',
    loadChildren: () =>
      import('./features/worker/worker.routes').then((m) => m.workerRoutes),
  },
  {
    path: 'manager',
    loadChildren: () =>
      import('./features/manager/manager.routes').then((m) => m.managerRoutes),
  },
  // {
  //   path: '**',
  //   loadComponent: () =>
  //     import('./shared/components/not-found/not-found.component').then(
  //       (m) => m.NotFoundComponent
  //     ),
  // },
];
