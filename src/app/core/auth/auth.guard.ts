import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Redirects unauthenticated users to /login?returnUrl=... (canActivate). */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Same check for lazy `canMatch`, so an unauthenticated user never downloads the
 * lazy chunk. `canMatch` receives the route and the matched URL segments.
 */
export const authMatchGuard: CanMatchFn = (_route, segments) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  const returnUrl = '/' + segments.map((segment) => segment.path).join('/');
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl } });
};
