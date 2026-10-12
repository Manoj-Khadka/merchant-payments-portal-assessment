import { AbstractControl, FormArray, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Form-array level validator: the sum of every principal's `ownershipPct` must
 * be exactly 100 and the array must contain at least one owner.
 */
export const ownershipTotal: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const array = control as FormArray;
  const total = array.controls.reduce(
    (sum, group) => sum + (Number(group.get('ownershipPct')?.value) || 0),
    0,
  );

  if (array.length === 0) {
    return { ownershipTotal: { total, required: true } };
  }

  return total === 100 ? null : { ownershipTotal: { total } };
};
