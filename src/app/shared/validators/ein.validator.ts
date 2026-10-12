import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** EIN must look like 12-3456789. */
export const einPattern = /^\d{2}-\d{7}$/;

export function einValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === undefined || value === '') return null;
    return einPattern.test(String(value).trim()) ? null : { ein: true };
  };
}
