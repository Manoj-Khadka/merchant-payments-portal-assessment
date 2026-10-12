import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

/**
 * Token storage trade-off.
 *
 * The access token is short-lived and kept in memory only, so XSS cannot read it
 * from storage. The refresh token is kept in `sessionStorage` for this mock so a
 * page reload can transparently re-authenticate.
 *
 * In production the refresh token should NOT live in web storage. The backend
 * should issue it as an HttpOnly, Secure, SameSite=Strict cookie, which JS can
 * never read and which is automatically attached on the refresh call.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly refreshKey = 'mpp.refreshToken';
  private readonly access = signal<string | null>(null);

  readonly accessToken = this.access.asReadonly();

  get refreshToken(): string | null {
    if (!this.isBrowser) return null;
    return sessionStorage.getItem(this.refreshKey);
  }

  setAccessToken(token: string | null): void {
    this.access.set(token);
  }

  setRefreshToken(token: string | null): void {
    if (!this.isBrowser) return;
    if (token) {
      sessionStorage.setItem(this.refreshKey, token);
    } else {
      sessionStorage.removeItem(this.refreshKey);
    }
  }

  clear(): void {
    this.setAccessToken(null);
    this.setRefreshToken(null);
  }
}
