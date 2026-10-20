import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./screens/layout/layout').then((m) => m.Layout),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        data: {
          headerTitle: 'dashboard',
        },
        loadComponent: () => import('./screens/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'menu',
        data: {
          headerTitle: 'menu manager',
        },
        loadComponent: () =>
          import('./screens/menu-manager/menu-manager').then((m) => m.MenuManager),
      },
      {
        path: 'inventory',
        data: {
          headerTitle: 'inventory',
        },
        loadComponent: () => import('./screens/inventory/inventory').then((m) => m.Inventory),
      },
      {
        path: 'reports',
        data: {
          headerTitle: 'reports & waste',
        },
        loadComponent: () => import('./screens/reports/reports').then((m) => m.Reports),
      },
      {
        path: 'staff',
        data: {
          headerTitle: 'staff directory',
        },
        loadComponent: () => import('./screens/staff/staff').then((m) => m.Staff),
      },
      {
        path: 'settings',
        data: {
          headerTitle: 'settings',
        },
        loadComponent: () => import('./screens/settings/settings').then((m) => m.Settings),
      },
    ],
  },
];
