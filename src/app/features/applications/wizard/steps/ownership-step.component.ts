import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { minimumAgeValidator } from '../../../../shared/validators/age.validator';
import { FieldErrorComponent } from '../../../../shared/ui/field-error/field-error.component';

@Component({
  selector: 'app-ownership-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FieldErrorComponent,
  ],
  templateUrl: './ownership-step.component.html',
  styleUrl: './ownership-step.component.scss',
})
export class OwnershipStepComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly array = input.required<FormArray>();

  protected readonly total = signal(0);
  protected readonly totalInvalid = signal(false);
  protected readonly groups = () =>
    this.array().controls.filter((control): control is FormGroup => control instanceof FormGroup);

  constructor() {
    // The array-level "must total 100%" rule is not a signal, so mirror it into
    // one so the warning appears/disappears reactively under OnPush.
    effect((onCleanup) => {
      const array = this.array();
      const update = () => {
        this.total.set(
          array.controls.reduce(
            (sum, group) => sum + (Number(group.get('ownershipPct')?.value) || 0),
            0,
          ),
        );
        this.totalInvalid.set(array.hasError('ownershipTotal') && array.touched);
      };

      update();
      const subscription = array.events.subscribe(update);
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected control(group: FormGroup, name: string): AbstractControl | null {
    return group.get(name);
  }

  protected add(): void {
    this.array().push(this.createGroup());
    this.array().markAsTouched();
  }

  protected remove(index: number): void {
    this.array().removeAt(index);
    this.array().markAsTouched();
  }

  private createGroup(): FormGroup {
    return this.fb.group({
      id: this.fb.control(''),
      name: this.fb.control('', Validators.required),
      ownershipPct: this.fb.control(0, [
        Validators.required,
        Validators.min(0),
        Validators.max(100),
      ]),
      dob: this.fb.control('', [Validators.required, minimumAgeValidator(18)]),
      ssnLast4: this.fb.control('', [Validators.required, Validators.pattern(/^\d{4}$/)]),
    });
  }
}
