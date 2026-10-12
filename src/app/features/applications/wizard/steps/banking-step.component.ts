import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { AbstractControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FieldErrorComponent } from '../../../../shared/ui/field-error/field-error.component';

@Component({
  selector: 'app-banking-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, FieldErrorComponent],
  templateUrl: './banking-step.component.html',
  styleUrl: './banking-step.component.scss',
})
export class BankingStepComponent {
  readonly group = input.required<FormGroup>();

  protected readonly rangeInvalid = signal(false);

  constructor() {
    effect((onCleanup) => {
      const group = this.group();
      const update = () => this.rangeInvalid.set(group.hasError('averageTicketExceedsVolume'));
      update();
      const subscription = group.events.subscribe(update);
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected control(name: string): AbstractControl | null {
    return this.group().get(name);
  }
}
