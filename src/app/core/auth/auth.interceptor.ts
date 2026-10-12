import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Attaches the bearer token to API calls and transparently refreshes once on a
 * 401. `/auth/*` calls are never decorated and never trigger a refresh, which is
 * what prevents the refresh call from recursing into itself.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  if (req.url.includes('/auth/')) {
    return next(req);
  }

  const withToken = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withToken(auth.accessToken())).pipe(
    catchError((error: unknown) => {
      // Only a 401 is an authentication problem worth refreshing for. Every
      // other failure (403, 404, 500, network) is passed straight through.
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      return auth.refreshAccessToken().pipe(
        // This handler sits *before* the retry, so it only ever sees failures of
        // the refresh call itself. If refreshing fails, the session is
        // unrecoverable and we log out. It cannot catch errors from the retried
        // request.
        catchError((refreshError: unknown) => {
          auth.logout();
          return throwError(() => refreshError);
        }),
        // Retry the original request exactly once with the fresh token. Because
        // this error handler sits *after* the refresh handler, a non-401 result
        // (e.g. 403 when the user lacks access) is forwarded unchanged. Only a
        // second 401 means the fresh token is also rejected, so we log out.
        switchMap((token) =>
          next(withToken(token)).pipe(
            catchError((retryError: unknown) => {
              if (retryError instanceof HttpErrorResponse && retryError.status === 401) {
                auth.logout();
              }
              return throwError(() => retryError);
            }),
          ),
        ),
      );
    }),
  );
};
