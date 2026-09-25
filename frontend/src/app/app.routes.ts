import { Routes } from '@angular/router';

export const routes: Routes = [
  // Dev-only style guide & design system smoke-test route (TABLZ-207)
  {
    path: 'dev/style-guide',
    loadComponent: () => import('./temp/components/components').then((m) => m.Components),
  },
  {
    path: 'temp',
    redirectTo: 'dev/style-guide',
    pathMatch: 'full',
  },
];
