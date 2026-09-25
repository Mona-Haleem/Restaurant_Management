import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./shared/screens/role-picker/role-picker').then((m) => m.RolePicker),
  },
  {
    path: 'customer',
    loadChildren: () => import('./features/customer/routes').then((m) => m.routes),
  },
  {
    path: 'worker',
    loadChildren: () => import('./features/worker/routes').then((m) => m.routes),
  },
  {
    path: 'manager',
    loadChildren: () => import('./features/manager/routes').then((m) => m.routes),
  },
  {
    path: 'auth/**',
    loadComponent: () => import('./shared/screens/auth/auth').then((m) => m.Auth),
  },
  {
    path: '**',
    loadComponent: () => import('./shared/screens/not-found/not-found').then((m) => m.NotFound),
  },
];
