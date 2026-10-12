import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * ABA routing-number checksum:
 * 3(d1+d4+d7) + 7(d2+d5+d8) + (d3+d6+d9) must be a non-zero multiple of 10.
 */
export function routingNumberValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = String(control.value ?? '').trim();
    if (!raw) return null;
    if (!/^\d{9}$/.test(raw)) return { routingNumber: true };

    const digits = raw.split('').map(Number);
    const checksum =
      3 * (digits[0] + digits[3] + digits[6]) +
      7 * (digits[1] + digits[4] + digits[7]) +
      (digits[2] + digits[5] + digits[8]);

    return checksum % 10 === 0 ? null : { routingNumber: true };
  };
}
