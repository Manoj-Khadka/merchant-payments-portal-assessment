import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AbstractControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FieldErrorComponent } from '../../../../shared/ui/field-error/field-error.component';

const ENTITY_TYPES = [
  { value: 'SOLE_PROPRIETORSHIP', label: 'Sole proprietorship' },
  { value: 'LLC', label: 'LLC' },
  { value: 'CORPORATION', label: 'Corporation' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
];

@Component({
  selector: 'app-business-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    FieldErrorComponent,
  ],
  templateUrl: './business-step.component.html',
  styleUrl: './business-step.component.scss',
})
export class BusinessStepComponent {
  readonly group = input.required<FormGroup>();
  protected readonly entityTypes = ENTITY_TYPES;

  protected control(path: string): AbstractControl | null {
    return this.group().get(path);
  }
}
