import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { PermissionService } from '../../../core/permissions/permission.service';
import { SensitiveDataService } from '../../../features/applications/detail/sensitive-data.service';

/**
 * Read-only display of a sensitive value.
 *
 * Masked by default: the server already sends a masked value (e.g. `••••6789`)
 * and this component renders exactly that until the viewer explicitly reveals
 * it. Revealing calls the server (`POST /applications/:id/reveal`), which is
 * where authorisation and audit logging happen — the client only decides
 * whether to *offer* the button, never whether the data may be released.
 *
 * The reveal button is only rendered for users holding `sensitive:reveal`.
 * Revealed values are re-masked automatically after ~30 s (see
 * `SensitiveDataService`) and cleared on navigation/logout.
 */
@Component({
  selector: 'app-masked-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton],
  templateUrl: './masked-field.component.html',
  styleUrl: './masked-field.component.scss',
})
export class MaskedFieldComponent {
  private readonly permissions = inject(PermissionService);
  private readonly sensitive = inject(SensitiveDataService);
  private readonly destroyRef = inject(DestroyRef);

  readonly fieldKey = input.required<string>();
  readonly applicationId = input.required<string>();
  /** Masked value sent by the server for everyone who may not see the real one. */
  readonly value = input.required<string>();
  /** Human label used for the accessible button name, e.g. "bank account number". */
  readonly label = input.required<string>();

  protected readonly error = signal<string | null>(null);
  protected readonly canReveal = this.permissions.can('sensitive:reveal');

  protected readonly revealedValue = computed(() => {
    const snapshot = this.sensitive.revealed();
    if (!snapshot || snapshot.applicationId !== this.applicationId()) return null;
    return this.sensitive.valueFor(this.fieldKey()) ?? null;
  });

  protected readonly isRevealed = computed(() => this.revealedValue() !== null);

  protected readonly display = computed(() => this.revealedValue() ?? this.value());

  protected readonly announcement = computed(() =>
    this.isRevealed()
      ? `${this.label()} revealed. It will be hidden again shortly.`
      : `${this.label()} hidden.`,
  );

  protected toggle(): void {
    if (this.isRevealed()) {
      this.sensitive.clear();
      return;
    }

    this.error.set(null);
    this.sensitive
      .reveal(this.applicationId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (error: unknown) => {
          const message =
            error instanceof Error && error.message
              ? error.message
              : 'Unable to reveal this value.';
          this.error.set(message);
        },
      });
  }
}
