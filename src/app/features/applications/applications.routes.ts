import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';
import { unsavedChangesGuard } from './wizard/unsaved-changes.guard';

export const APPLICATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/application-list.page').then((m) => m.ApplicationListPage),
  },
  {
    path: 'new',
    canMatch: [roleGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { roles: ['SALES'] },
    loadComponent: () => import('./wizard/wizard.page').then((m) => m.WizardPage),
  },
  {
    path: ':id/edit',
    canMatch: [roleGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { roles: ['SALES'] },
    loadComponent: () => import('./wizard/wizard.page').then((m) => m.WizardPage),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./detail/application-detail.page').then((m) => m.ApplicationDetailPage),
  },
];
