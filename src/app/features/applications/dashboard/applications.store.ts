import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  merge,
  switchMap,
  tap,
} from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/error.interceptor';
import { ApplicationQuery, MerchantApplication } from '../../../core/models/application.model';
import { Page } from '../../../core/models/page.model';
import { ApplicationsApi } from '../applications.api';

export type LoadState = 'idle' | 'loading' | 'error' | 'success';

export const DEFAULT_QUERY: ApplicationQuery = {
  page: 1,
  pageSize: 10,
  status: null,
  q: '',
  sort: 'updatedAt,desc',
};

/**
 * Signal-based store for the application list. `query` is the single source of
 * truth: every change flows through one debounced, switch-mapped pipeline, so
 * stale requests are cancelled when filters change quickly.
 */
@Injectable({ providedIn: 'root' })
export class ApplicationsStore {
  private readonly api = inject(ApplicationsApi);
  private readonly auth = inject(AuthService);
  private readonly reload$ = new Subject<void>();

  readonly query = signal<ApplicationQuery>({ ...DEFAULT_QUERY });
  readonly state = signal<LoadState>('idle');
  readonly data = signal<Page<MerchantApplication> | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    merge(toObservable(this.query).pipe(debounceTime(300)), this.reload$)
      .pipe(
        tap(() => {
          this.state.set('loading');
          this.error.set(null);
        }),
        switchMap(() =>
          this.api.list(this.query()).pipe(
            // catchError lives inside switchMap so one failure never kills the pipeline.
            tap((page) => {
              this.data.set(page);
              this.state.set('success');
            }),
            catchError((error: unknown) => {
              this.error.set(
                error instanceof ApiError ? error.message : 'Unable to load applications.',
              );
              this.state.set('error');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe();

    // When the signed-in user goes away (logout, failed refresh), drop
    // everything this store was showing so the next visitor never sees stale
    // rows — not even for a frame. The query is deliberately left alone:
    // resetting it here would kick off an unauthenticated fetch.
    effect(() => {
      if (this.auth.isAuthenticated()) return;
      untracked(() => {
        this.data.set(null);
        this.error.set(null);
        this.state.set('idle');
      });
    });
  }

  /**
   * Called every time the list page is entered. Clears whatever the previous
   * visitor left behind, shows the loading state immediately, and applies the
   * given query as a *fresh* object so an equal query still triggers a reload.
   */
  open(query: ApplicationQuery): void {
    this.data.set(null);
    this.error.set(null);
    this.state.set('loading');
    this.query.set({ ...query });
  }

  setPage(page: number): void {
    this.query.update((query) => ({ ...query, page }));
  }

  setPageSize(pageSize: number): void {
    this.query.update((query) => ({ ...query, pageSize, page: 1 }));
  }

  setStatus(status: ApplicationQuery['status']): void {
    this.query.update((query) => ({ ...query, status, page: 1 }));
  }

  setSearch(q: string): void {
    this.query.update((query) => ({ ...query, q, page: 1 }));
  }

  retry(): void {
    this.reload$.next();
  }
}
