import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup } from '@angular/forms';
import {
  EMPTY,
  Subject,
  Subscription,
  catchError,
  concatMap,
  debounceTime,
  defer,
  filter,
  map,
  merge,
  retry,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { ApiError } from '../../../core/http/error.interceptor';
import { ApplicationsApi } from '../applications.api';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Normalised status for both the raw `HttpErrorResponse` and the `ApiError`. */
function statusOf(error: unknown): number {
  if (error instanceof ApiError) return error.status;
  if (error instanceof HttpErrorResponse) return error.status;
  return -1;
}

/**
 * Only transient failures are worth retrying: a network hiccup (status 0) or a
 * 5xx. Anything else — 400, 403, 409 — is deterministic and must fail
 * immediately, otherwise a version conflict would be retried into more conflicts.
 */
function isTransient(error: unknown): boolean {
  const status = statusOf(error);
  return status === 0 || (status >= 500 && status < 600);
}

/**
 * Debounced, version-aware draft autosave.
 *
 * The form is the source of truth; saving is a side effect. `catchError` sits
 * *inside* the mapped inner observable, so a failed save never tears down the
 * valueChanges stream. Drafts save even while invalid (`getRawValue()`), which
 * is what lets a half-finished application survive navigation.
 *
 * Past saves are serialised with `concatMap` (not `switchMap`): cancelling an
 * in-flight save would lose the new version number it returned, so the next
 * save would send a stale version and be rejected with a 409. Each save reads
 * the current version lazily via `defer`, at the moment it actually starts.
 *
 * A debounced value is skipped only if it equals the value most recently handed
 * to the save pipeline (`lastRequestedValue`) **and** the server has confirmed
 * that same value (`lastSavedValue`). Comparing against the requested value — not
 * only the confirmed one — matters while a slow save is in flight: reverting the
 * form to the previously saved value is a *change*, because the server is about
 * to hold the in-flight value instead. Skipping it there would leave the server
 * and the form disagreeing while the UI reported "saved".
 */
@Injectable({ providedIn: 'root' })
export class DraftAutosaveService {
  private readonly api = inject(ApplicationsApi);
  private subscription: Subscription | null = null;

  readonly saveState = signal<SaveState>('idle');
  readonly lastSavedAt = signal<Date | null>(null);
  readonly conflict = signal(false);
  /** True while the form holds edits that have not been persisted yet. */
  readonly hasPendingChanges = signal(false);

  private version = 0;
  /** The value the server has confirmed; the baseline for "pending changes". */
  private lastSavedValue: unknown = null;
  /** The value most recently handed to the save pipeline (may still be in flight). */
  private lastRequestedValue: unknown = null;
  /** Manual "save now" trigger, used by the Retry affordance after a failure. */
  private readonly retry$ = new Subject<void>();

  init(form: FormGroup, id: string, version = 0, destroyRef?: DestroyRef): void {
    this.version = version;
    this.saveState.set('idle');
    this.lastSavedAt.set(null);
    this.conflict.set(false);
    this.hasPendingChanges.set(false);
    // The form is patched from the loaded draft before init, so its current
    // value is the server's starting point for both baselines.
    this.lastSavedValue = form.getRawValue();
    this.lastRequestedValue = form.getRawValue();
    this.subscription?.unsubscribe();

    const stream = merge(
      form.valueChanges.pipe(
        // Flag pending changes *before* the debounce so the UI can disable Submit
        // immediately, instead of letting a submit race the last edit.
        tap(() => this.hasPendingChanges.set(true)),
        debounceTime(800),
      ),
      // A manual retry saves at once instead of waiting out the debounce. It still
      // enters the queue below, so it serialises behind any save already in flight.
      this.retry$.pipe(tap(() => this.hasPendingChanges.set(true))),
    ).pipe(
      map(() => form.getRawValue()),
      filter((value) => {
        // Only a value that has already been handed to the pipeline can be
        // skipped. Reverting to the last *confirmed* value is not a duplicate
        // when a different value is still in flight — the server is about to
        // hold that in-flight value, so the revert must be saved.
        if (!isEqual(value, this.lastRequestedValue)) return true;

        // This exact value has already been requested. If the server has also
        // confirmed it, nothing is outstanding (type a character, delete it
        // again) — clear the flag instead of leaving Submit stuck.
        if (isEqual(value, this.lastSavedValue)) {
          this.hasPendingChanges.set(false);
          // The form matches the server, so a previous failure is moot. A
          // conflict is different: the server holds a newer version, so the
          // error state and reload banner must stay.
          if (this.saveState() === 'error' && !this.conflict()) {
            this.saveState.set('idle');
          }
        }
        return false;
      }),
      tap((value) => {
        this.lastRequestedValue = value;
        this.saveState.set('saving');
      }),
      concatMap((value) =>
        // `defer` reads `this.version` when the save actually starts, so a save
        // that waited behind a slow one uses the freshest version.
        defer(() => this.api.saveDraft(id, value, this.version)).pipe(
          retry({
            count: MAX_RETRIES,
            // Returning an erroring observable aborts the retry loop and
            // forwards the original error untouched.
            delay: (error: unknown, retryCount: number) => {
              if (!isTransient(error)) return throwError(() => error);
              return timer(RETRY_BASE_MS * 2 ** retryCount);
            },
          }),
          tap((saved) => {
            this.version = saved.version;
            this.lastSavedValue = value;
            this.lastSavedAt.set(new Date());
            this.conflict.set(false);
            this.saveState.set('saved');
            // Only clear "pending" if nothing changed while this save was in
            // flight; otherwise a newer edit is still waiting to be saved.
            if (isEqual(this.lastSavedValue, form.getRawValue())) {
              this.hasPendingChanges.set(false);
            }
          }),
          catchError((error: unknown) => {
            if (error instanceof ApiError && error.status === 409) {
              this.conflict.set(true);
            }
            this.saveState.set('error');
            // The server still holds the last confirmed value. Re-arm the
            // pipeline so the failed value can be retried by a later edit
            // instead of being mistaken for an already-requested duplicate.
            if (isEqual(this.lastRequestedValue, value)) {
              this.lastRequestedValue = this.lastSavedValue;
            }
            return EMPTY;
          }),
        ),
      ),
    );

    this.subscription = destroyRef
      ? stream.pipe(takeUntilDestroyed(destroyRef)).subscribe()
      : stream.subscribe();
  }

  destroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  /**
   * Re-send the form's current value through the save queue. Exposed for the
   * "Retry" affordance shown after a failed autosave, so the user can unblock
   * Submit without making a dummy edit. A failed save re-arms the requested
   * baseline, so the retried value is not mistaken for an in-flight duplicate.
   */
  retry(): void {
    this.retry$.next();
  }

  reset(): void {
    this.saveState.set('idle');
    this.lastSavedAt.set(null);
    this.conflict.set(false);
    this.hasPendingChanges.set(false);
    this.lastSavedValue = null;
    this.lastRequestedValue = null;
  }
}
