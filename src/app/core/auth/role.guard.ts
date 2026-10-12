import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { Role } from '../models/user.model';
import { AuthService } from './auth.service';

/**
 * Route-level role gate. Roles are read from `route.data.roles`. Used with
 * `canMatch` so an unauthorised user never downloads the lazy chunk, and is sent
 * to a visible /forbidden page rather than failing silently.
 */
export const roleGuard: CanMatchFn = (route) => {
  const auth = inject(AuthService);
  const roles = (route.data?.['roles'] as Role[] | undefined) ?? [];
  const role = auth.role();

  if (roles.length === 0 || (role !== null && roles.includes(role))) {
    return true;
  }

  return inject(Router).createUrlTree(['/forbidden']);
};
