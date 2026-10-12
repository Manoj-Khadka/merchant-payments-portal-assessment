import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { errorInterceptor } from '../../../core/http/error.interceptor';
import { MerchantApplication } from '../../../core/models/application.model';
import { ApplicationsStore, DEFAULT_QUERY } from './applications.store';

const URL = '/api/applications';

function page(items: Partial<MerchantApplication>[] = [], total = items.length) {
  return { total, page: 1, pageSize: 10, items };
}

describe('ApplicationsStore', () => {
  let store: ApplicationsStore;
  let controller: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        // The store watches AuthService; keep the router out of the picture.
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(ApplicationsStore);
    controller = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    // Flush the initial `toObservable(query)` effect, then let the debounce elapse.
    TestBed.tick();
    vi.advanceTimersByTime(300);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues the initial list request from the default query', () => {
    const request = controller.expectOne((req) => req.url === URL);
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('10');
    request.flush(page());
    expect(store.state()).toBe('success');
    controller.verify();
  });

  it('re-requests when the query changes', () => {
    controller.expectOne((req) => req.url === URL).flush(page());

    store.setSearch('globex');
    TestBed.tick();
    vi.advanceTimersByTime(300);

    const request = controller.expectOne((req) => req.url === URL);
    expect(request.request.params.get('q')).toBe('globex');
    request.flush(page([{ id: 'app_1004', businessName: 'Globex LLC', status: 'IN_REVIEW' } as MerchantApplication]));

    expect(store.data()?.items.length).toBe(1);
    controller.verify();
  });

  it('captures an error state and recovers on retry', () => {
    controller
      .expectOne((req) => req.url === URL)
      .flush({ error: 'server_error', message: 'Boom' }, { status: 500, statusText: 'Server Error' });

    expect(store.state()).toBe('error');
    expect(store.error()).toBe('Boom');

    store.retry();
    const retryRequest = controller.expectOne((req) => req.url === URL);
    retryRequest.flush(page());
    expect(store.state()).toBe('success');
    expect(store.error()).toBeNull();
    controller.verify();
  });

  it('sends a distinct request for each page change', () => {
    controller.expectOne((req) => req.url === URL).flush(page());

    store.setPage(3);
    TestBed.tick();
    vi.advanceTimersByTime(300);

    const request = controller.expectOne((req) => req.url === URL);
    expect(request.request.params.get('page')).toBe('3');
    request.flush(page());
    controller.verify();
  });

  it('re-opening with an equal query refetches and shows the new data', () => {
    controller
      .expectOne((req) => req.url === URL)
      .flush(page([{ id: 'app_1', businessName: 'Old Co' } as MerchantApplication]));

    // Same values as the current query: a plain query.set() would be a no-op,
    // but open() must still clear the old rows and refetch.
    store.open({ ...DEFAULT_QUERY });
    expect(store.state()).toBe('loading');
    expect(store.data()).toBeNull();

    TestBed.tick();
    vi.advanceTimersByTime(300);

    const request = controller.expectOne((req) => req.url === URL);
    request.flush(page([{ id: 'app_2', businessName: 'New Co' } as MerchantApplication]));

    expect(store.data()?.items[0].businessName).toBe('New Co');
    expect(store.state()).toBe('success');
    controller.verify();
  });

  it('clears data and returns to idle after the user signs out', () => {
    controller
      .expectOne((req) => req.url === URL)
      .flush(page([{ id: 'app_1', businessName: 'Admin Co' } as MerchantApplication]));
    expect(store.data()).not.toBeNull();

    // Establish an authenticated session.
    auth.login({ email: 'admin@example.com', password: 'password' }).subscribe();
    controller.expectOne('/api/auth/login').flush({
      accessToken: 'a',
      refreshToken: 'b',
      expiresIn: 30,
      user: { id: 'usr_admin', name: 'Avery Admin', role: 'ADMIN', email: 'admin@example.com' },
    });
    expect(auth.isAuthenticated()).toBe(true);

    auth.logout();
    controller.expectOne('/api/auth/logout').flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    TestBed.tick();

    // The next visitor must never see the previous user's rows.
    expect(store.data()).toBeNull();
    expect(store.state()).toBe('idle');
    controller.verify();
  });
});
