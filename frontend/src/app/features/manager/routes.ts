import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./screens/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'menu',
    loadComponent: () => import('./screens/menu-manager/menu-manager').then((m) => m.MenuManager),
  },
  {
    path: 'inventory',
    loadComponent: () => import('./screens/inventory/inventory').then((m) => m.Inventory),
  },
  {
    path: 'reports',
    loadComponent: () => import('./screens/reports/reports').then((m) => m.Reports),
  },
  {
    path: 'staff',
    loadComponent: () => import('./screens/staff/staff').then((m) => m.Staff),
  },
  {
    path: 'settings',
    loadComponent: () => import('./screens/settings/settings').then((m) => m.Settings),
  },
];
