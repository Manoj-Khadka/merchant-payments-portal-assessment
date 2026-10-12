import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  CanMatchFn,
  Route,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard, authMatchGuard } from './auth.guard';
import { roleGuard } from './role.guard';

interface AuthStub {
  isAuthenticated: () => boolean;
  role: () => string | null;
}

function configure(auth: AuthStub): void {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
}

function asUrlTree(result: unknown): UrlTree {
  expect(result).toBeInstanceOf(UrlTree);
  return result as UrlTree;
}

/** Angular 22 CanMatchFn takes (route, segments, currentSnapshot). */
function runMatch(fn: CanMatchFn, route: Route, segments: Array<{ path: string }>) {
  return TestBed.runInInjectionContext(() => fn(route, segments as never, {} as never));
}

describe('authGuard (canActivate)', () => {
  it('redirects an unauthenticated user to /login with a returnUrl', () => {
    configure({ isAuthenticated: () => false, role: () => null });
    const state = { url: '/applications/app_1' } as RouterStateSnapshot;

    const result = TestBed.runInInjectionContext(() =>
      (authGuard as CanActivateFn)({} as ActivatedRouteSnapshot, state),
    );
    const tree = asUrlTree(result);
    expect(tree.toString()).toBe('/login?returnUrl=%2Fapplications%2Fapp_1');
  });

  it('lets an authenticated user through', () => {
    configure({ isAuthenticated: () => true, role: () => 'SALES' });
    const state = {} as RouterStateSnapshot;

    const result = TestBed.runInInjectionContext(() =>
      (authGuard as CanActivateFn)({} as ActivatedRouteSnapshot, state),
    );
    expect(result).toBe(true);
  });
});

describe('authMatchGuard (canMatch)', () => {
  it('redirects before the lazy chunk loads', () => {
    configure({ isAuthenticated: () => false, role: () => null });
    const route = { path: 'applications' } as Route;
    const segments = [{ path: 'applications' }, { path: 'new' }];

    const result = runMatch(authMatchGuard, route, segments);
    expect(result).toBeInstanceOf(UrlTree);
  });
});

describe('roleGuard (canMatch)', () => {
  const routeWith = (roles: string[]): Route => ({ path: 'x', data: { roles } }) as Route;

  it('blocks a user whose role is not allowed and sends them to /forbidden', () => {
    configure({ isAuthenticated: () => true, role: () => 'SALES' });
    const result = runMatch(roleGuard, routeWith(['REVIEWER']), []);
    expect(asUrlTree(result).toString()).toBe('/forbidden');
  });

  it('allows a user whose role is listed', () => {
    configure({ isAuthenticated: () => true, role: () => 'ADMIN' });
    const result = runMatch(roleGuard, routeWith(['REVIEWER', 'ADMIN']), []);
    expect(result).toBe(true);
  });

  it('allows any authenticated role when no roles are declared', () => {
    configure({ isAuthenticated: () => true, role: () => 'SALES' });
    const result = runMatch(roleGuard, routeWith([]), []);
    expect(result).toBe(true);
  });
});
