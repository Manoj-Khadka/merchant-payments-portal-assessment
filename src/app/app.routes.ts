import { Routes } from '@angular/router';
import { authMatchGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./features/forbidden/forbidden.page').then((m) => m.ForbiddenPage),
  },
  {
    path: 'applications',
    canMatch: [authMatchGuard],
    loadChildren: () =>
      import('./features/applications/applications.routes').then((m) => m.APPLICATION_ROUTES),
  },
  { path: '', pathMatch: 'full', redirectTo: 'applications' },
  { path: '**', redirectTo: 'applications' },
];
