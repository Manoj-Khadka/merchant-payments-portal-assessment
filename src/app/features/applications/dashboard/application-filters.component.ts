import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption } from '@angular/material/core';
import { MatSelect } from '@angular/material/select';
import { AppStatus } from '../../../core/models/application.model';

const STATUSES: ReadonlyArray<{ value: AppStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

/**
 * Presentational filter bar. It owns only the input state; the store debounces
 * and turns the emitted values into a single request pipeline.
 */
@Component({
  selector: 'app-application-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormField, MatLabel, MatInput, MatSelect, MatOption],
  templateUrl: './application-filters.component.html',
  styleUrl: './application-filters.component.scss',
})
export class ApplicationFiltersComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly query = input('');
  readonly status = input<AppStatus | null>(null);
  readonly queryChange = output<string>();
  readonly statusChange = output<AppStatus | null>();

  protected readonly statuses = STATUSES;

  protected readonly form = this.fb.group({
    q: this.fb.control(''),
    status: this.fb.control<AppStatus | ''>(''),
  });

  constructor() {
    // Reflect parent-driven changes (e.g. restored from the URL) without
    // re-emitting them and creating a loop.
    effect(() => {
      this.form.patchValue(
        { q: this.query(), status: this.status() ?? '' },
        { emitEvent: false },
      );
    });

    this.form.controls.q.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => this.queryChange.emit(q));

    this.form.controls.status.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => this.statusChange.emit(status || null));
  }
}
