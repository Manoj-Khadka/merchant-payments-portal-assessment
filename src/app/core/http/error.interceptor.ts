import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export interface ApiErrorBody {
  error: string;
  message?: string;
  reason?: string;
  currentVersion?: number;
}

/** Normalised error surfaced to stores and pages, regardless of transport. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body?: ApiErrorBody | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function defaultMessage(status: number): string {
  if (status === 0) return 'Unable to reach the server. Check that the mock API is running.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested resource was not found.';
  if (status === 409) return 'This record was changed by someone else. Reload and try again.';
  if (status >= 500) return 'Something went wrong on the server. Please retry.';
  return `Request failed with status ${status}.`;
}

/**
 * Runs as the outermost interceptor so `authInterceptor` still receives the raw
 * `HttpErrorResponse` (and can refresh on a 401) before it is normalised.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const body = (error.error ?? null) as ApiErrorBody | null;
        const code = body?.error ?? `http_${error.status}`;
        const message = body?.message ?? defaultMessage(error.status);
        return throwError(() => new ApiError(error.status, code, message, body));
      }
      return throwError(() => error);
    }),
  );
