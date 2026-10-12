import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MerchantApplication } from '../../../core/models/application.model';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';

export interface DecisionDraft {
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}

/**
 * Decision form shown to the assigned reviewer of an application that is
 * `IN_REVIEW` (the parent owns the gate). A rejection *must* carry a reason of
 * at least five characters; an approval may optionally include one.
 */
@Component({
  selector: 'app-review-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    FieldErrorComponent,
  ],
  templateUrl: './review-panel.component.html',
  styleUrl: './review-panel.component.scss',
})
export class ReviewPanelComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly application = input.required<MerchantApplication>();
  readonly submitting = input(false);
  readonly decide = output<DecisionDraft>();

  protected readonly reasonRequired = signal(false);

  protected readonly form = this.fb.group({
    decision: this.fb.control<'APPROVE' | 'REJECT'>('APPROVE'),
    reason: this.fb.control(''),
  });

  protected get reasonControl() {
    return this.form.controls.reason;
  }

  constructor() {
    this.form.controls.decision.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((decision) => this.applyReasonRules(decision));
    this.applyReasonRules('APPROVE');
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { decision, reason } = this.form.getRawValue();
    this.decide.emit({ decision, reason: reason.trim() });
  }

  protected isDecided(): boolean {
    const status = this.application().status;
    return status === 'APPROVED' || status === 'REJECTED';
  }

  private applyReasonRules(decision: 'APPROVE' | 'REJECT'): void {
    const control = this.form.controls.reason;
    const required = decision === 'REJECT';
    this.reasonRequired.set(required);
    control.setValidators(required ? [Validators.required, Validators.minLength(5)] : []);
    control.updateValueAndValidity({ emitEvent: false });
  }
}
