import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

function yearsSince(date: Date, now: Date): number {
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

/** Owners/principals must be at least `minimum` years old. */
export function minimumAgeValidator(minimum = 18): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { minimumAge: { required: minimum } };

    const age = yearsSince(date, new Date());
    return age >= minimum ? null : { minimumAge: { required: minimum, actual: age } };
  };
}
