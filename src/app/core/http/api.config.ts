import { InjectionToken } from '@angular/core';

/**
 * Base URL for the mock API. The Angular dev-server proxies `/api` to the
 * Express mock API (see `proxy.conf.json`), so the browser and SSR never need
 * to know the mock API origin.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});
