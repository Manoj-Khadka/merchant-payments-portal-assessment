import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { API_BASE_URL } from '../http/api.config';
import { AuthResponse, LoginRequest, Role, Tokens, User } from '../models/user.model';
import { TokenStorage } from './token-storage';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly storage = inject(TokenStorage);
  private readonly apiBase = inject(API_BASE_URL);

  private readonly currentUser = signal<User | null>(null);
  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly role = computed<Role | null>(() => this.currentUser()?.role ?? null);

  private refreshInFlight$: Observable<string> | null = null;

  login(credentials: LoginRequest): Observable<User> {
    return this.http.post<AuthResponse>(`${this.apiBase}/auth/login`, credentials).pipe(
      tap((response) => this.setSession(response)),
      map((response) => response.user),
    );
  }

  logout(options: { redirect?: boolean } = {}): void {
    const refreshToken = this.storage.refreshToken;
    if (refreshToken) {
      this.http
        .post<void>(`${this.apiBase}/auth/logout`, { refreshToken })
        .pipe(catchError(() => of(void 0)))
        .subscribe();
    }
    this.clearSession();
    if (options.redirect !== false) {
      void this.router.navigate(['/login']);
    }
  }

  /**
   * Single-flight refresh: every concurrent caller shares one in-flight request,
   * so a burst of 401s triggers exactly one call to `/auth/refresh`.
   */
  refreshAccessToken(): Observable<string> {
    const refreshToken = this.storage.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    this.refreshInFlight$ ??= this.http
      .post<AuthResponse>(`${this.apiBase}/auth/refresh`, { refreshToken })
      .pipe(
        tap((response) => this.setSession(response)),
        map((response) => response.accessToken),
        shareReplay({ bufferSize: 1, refCount: false }),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
      );

    return this.refreshInFlight$;
  }

  /** Called from an app initializer to rehydrate a session on reload. */
  restoreSession(): Observable<void> {
    if (!this.storage.refreshToken) return of(void 0);
    return this.refreshAccessToken().pipe(
      map(() => void 0),
      catchError(() => {
        this.clearSession();
        return of(void 0);
      }),
    );
  }

  accessToken(): string | null {
    return this.storage.accessToken();
  }

  private setSession(response: AuthResponse | Tokens): void {
    this.storage.setAccessToken(response.accessToken);
    if (response.refreshToken) {
      this.storage.setRefreshToken(response.refreshToken);
    }
    if ('user' in response) {
      this.currentUser.set(response.user);
    }
  }

  private clearSession(): void {
    this.storage.clear();
    this.currentUser.set(null);
    this.refreshInFlight$ = null;
  }
}
