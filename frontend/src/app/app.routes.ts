import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard/auth-guard';
import { roleGuard } from './core/guards/role-guard/role-guard';

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
    canActivateChild: [authGuard, roleGuard],
    data: { roles: ['worker', 'manager', 'admin'] },
  },
  {
    path: 'manager',
    loadChildren: () => import('./features/manager/routes').then((m) => m.routes),
    canActivateChild: [authGuard, roleGuard],
    data: { roles: ['manager', 'admin'] },
  },
  {
    path: 'auth/**',
    loadComponent: () => import('./shared/screens/auth/auth').then((m) => m.Auth),
  },
  {
    path: 'unauthorized',
    loadComponent: () =>
      import('./shared/screens/unauthorized/unauthorized').then((m) => m.Unauthorized),
  },
  {
    path: '**',
    loadComponent: () => import('./shared/screens/not-found/not-found').then((m) => m.NotFound),
  },
];
