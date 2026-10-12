import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { TokenStorage } from './token-storage';

const API = '/api';
const USER = { id: 'usr_reviewer', name: 'Rita Reviewer', role: 'REVIEWER', email: 'r@example.com' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: AuthService;
  let storage: TokenStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // AuthService navigates to /login on logout; a stub keeps that out of
        // the router entirely so no navigation rejection is logged.
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    storage = TestBed.inject(TokenStorage);

    storage.setAccessToken('old-token');
    storage.setRefreshToken('refresh-1');
  });

  afterEach(() => controller.verify());

  function unauthorized() {
    return { status: 401, statusText: 'Unauthorized' };
  }

  it('coalesces three concurrent 401s into a single refresh and retries each once', () => {
    const completed: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      http.get(`${API}/applications`).subscribe({ complete: () => completed.push(true) });
    }

    const initial = controller.match(`${API}/applications`);
    expect(initial.length).toBe(3);
    initial.forEach((req) => {
      expect(req.request.headers.get('Authorization')).toBe('Bearer old-token');
      req.flush({}, unauthorized());
    });

    // Exactly one refresh, not three.
    const refresh = controller.expectOne(`${API}/auth/refresh`);
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    refresh.flush({ accessToken: 'new-token', refreshToken: 'refresh-2', expiresIn: 30, user: USER });

    const retried = controller.match(`${API}/applications`);
    expect(retried.length).toBe(3);
    retried.forEach((req) => {
      expect(req.request.headers.get('Authorization')).toBe('Bearer new-token');
      req.flush({ items: [] });
    });

    expect(completed.length).toBe(3);
    expect(storage.refreshToken).toBe('refresh-2');
  });

  it('logs the user out when the refresh itself fails', () => {
    let errored = false;
    http.get(`${API}/applications`).subscribe({ error: () => (errored = true) });

    controller.expectOne(`${API}/applications`).flush({}, unauthorized());
    controller
      .expectOne(`${API}/auth/refresh`)
      .flush({ error: 'invalid_refresh_token' }, unauthorized());

    // logout() fires a best-effort call to revoke the refresh token.
    controller
      .expectOne(`${API}/auth/logout`)
      .flush(null, { status: 204, statusText: 'No Content' });

    expect(errored).toBe(true);
    expect(storage.accessToken()).toBeNull();
    expect(storage.refreshToken).toBeNull();
  });

  it('does not refresh a second time when the retried request also 401s', () => {
    http.get(`${API}/applications`).subscribe({ error: () => undefined });

    controller.expectOne(`${API}/applications`).flush({}, unauthorized());
    controller
      .expectOne(`${API}/auth/refresh`)
      .flush({ accessToken: 'new-token', refreshToken: 'refresh-2', expiresIn: 30, user: USER });

    // The retried request 401s again -> we must NOT loop into a second refresh.
    controller.expectOne(`${API}/applications`).flush({}, unauthorized());
    controller.expectNone(`${API}/auth/refresh`);

    // Instead the user is logged out.
    controller
      .expectOne(`${API}/auth/logout`)
      .flush(null, { status: 204, statusText: 'No Content' });
  });

  it('does not log out when the retried request fails with a non-401', () => {
    let status: number | null = null;
    http
      .get(`${API}/applications`)
      .subscribe({ error: (error: HttpErrorResponse) => (status = error.status) });

    controller.expectOne(`${API}/applications`).flush({}, unauthorized());
    controller
      .expectOne(`${API}/auth/refresh`)
      .flush({ accessToken: 'new-token', refreshToken: 'refresh-2', expiresIn: 30, user: USER });

    // The retry fails with 403: a permissions problem, not an auth problem. The
    // user must stay signed in and must not be bounced to the login screen.
    controller
      .expectOne(`${API}/applications`)
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });

    expect(status).toBe(403);
    controller.expectNone(`${API}/auth/logout`);
    expect(storage.refreshToken).toBe('refresh-2');
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('never decorates or refreshes /auth/* requests', () => {
    auth.login({ email: 'r@example.com', password: 'password' }).subscribe();

    const login = controller.expectOne(`${API}/auth/login`);
    expect(login.request.headers.has('Authorization')).toBe(false);
    login.flush({ accessToken: 'a', refreshToken: 'b', expiresIn: 30, user: USER });

    expect(auth.isAuthenticated()).toBe(true);
  });
});
