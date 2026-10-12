import { Injectable, inject } from '@angular/core';
import { AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { Observable, catchError, delay, map, of, switchMap, timer } from 'rxjs';

/**
 * Simulates a server-side uniqueness check for a business legal name. A real
 * implementation would call an API (e.g. GET /api/applications?q=<name>).
 */
@Injectable({ providedIn: 'root' })
export class BusinessNameService {
  private readonly taken = new Set(['acme corp', 'globex llc', 'initrode inc', 'hooli']);

  isTaken(name: string): Observable<boolean> {
    return of(this.taken.has(name.trim().toLowerCase())).pipe(delay(300));
  }
}

/**
 * Async validator that debounces typed input with `timer` and cancels a stale
 * check with `switchMap`, so the control shows a pending state while it runs.
 */
export function businessNameUnique(service: BusinessNameService, debounceMs = 400): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const name = String(control.value ?? '').trim();
    if (!name) return of(null);

    return timer(debounceMs).pipe(
      switchMap(() => service.isTaken(name)),
      map((taken) => (taken ? { businessNameTaken: true } : null)),
      catchError(() => of(null)),
    );
  };
}

/** Convenience factory bound to the injected service. */
export function businessNameUniqueValidator(debounceMs = 400): AsyncValidatorFn {
  return businessNameUnique(inject(BusinessNameService), debounceMs);
}
