import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, of, shareReplay, tap } from 'rxjs';
import { RevealedFields } from '../../../core/models/application.model';
import { ApplicationsApi } from '../applications.api';

interface RevealedSnapshot {
  applicationId: string;
  fields: RevealedFields;
}

/** How long a revealed value stays on screen before it is automatically re-masked. */
export const REVEAL_TTL_MS = 30_000;

/**
 * Maps a `fieldKey` (see `<app-masked-field>`) onto the payload returned by
 * `POST /applications/:id/reveal`.
 *
 *   'ein'  |  'routingNumber'  |  'accountNumber'  |  'ssnLast4:<ownerId>'
 */
export function resolveRevealed(fields: RevealedFields, fieldKey: string): string | undefined {
  switch (fieldKey) {
    case 'ein':
      return fields.ein;
    case 'routingNumber':
      return fields.routingNumber;
    case 'accountNumber':
      return fields.accountNumber;
    default: {
      const ownerMatch = /^ssnLast4:(.+)$/.exec(fieldKey);
      if (ownerMatch) {
        return fields.owners.find((entry) => entry.id === ownerMatch[1])?.ssnLast4;
      }
      return undefined;
    }
  }
}

/**
 * Holds revealed sensitive values for the *currently open application only*.
 *
 * Provided at the application-detail component level, so navigating away
 * destroys the service and drops every revealed value with it. On top of that,
 * anything revealed is automatically re-masked after {@link REVEAL_TTL_MS}, and
 * the service never writes a value to storage, the console, or a URL.
 */
@Injectable()
export class SensitiveDataService {
  private readonly api = inject(ApplicationsApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly revealed = signal<RevealedSnapshot | null>(null);

  private inFlight$: Observable<RevealedFields> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Belt and braces: clear on destroy even though the instance is scoped.
    this.destroyRef.onDestroy(() => this.clear());
  }

  /** True when real values are currently on screen for this application. */
  isRevealedFor(applicationId: string): boolean {
    return this.revealed()?.applicationId === applicationId;
  }

  /** Resolves one field from the current reveal payload, if any. */
  valueFor(fieldKey: string): string | undefined {
    const current = this.revealed();
    return current ? resolveRevealed(current.fields, fieldKey) : undefined;
  }

  /** Single-flight reveal so several fields sharing one payload issue one call. */
  reveal(applicationId: string): Observable<RevealedFields> {
    const current = this.revealed();
    if (current && current.applicationId === applicationId) {
      return of(current.fields);
    }

    this.inFlight$ ??= this.api.reveal(applicationId).pipe(
      tap((fields) => {
        this.revealed.set({ applicationId, fields });
        this.scheduleReMask();
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
      finalize(() => {
        this.inFlight$ = null;
      }),
    );

    return this.inFlight$;
  }

  /** Drops every revealed value immediately (navigation, logout, manual hide). */
  clear(): void {
    this.clearTimer();
    this.inFlight$ = null;
    this.revealed.set(null);
  }

  private scheduleReMask(): void {
    this.clearTimer();
    this.timer = setTimeout(() => this.clear(), REVEAL_TTL_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
