import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export function urlValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) return null;
    return URL_PATTERN.test(value) ? null : { url: true };
  };
}
