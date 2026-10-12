import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Cross-field rule on the processing group: the average ticket cannot exceed the
 * monthly volume (you cannot process one transaction larger than the month's
 * total).
 */
export const processingRangeValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const monthlyVolume = Number(control.get('monthlyVolume')?.value) || 0;
  const averageTicket = Number(control.get('averageTicket')?.value) || 0;

  if (averageTicket > monthlyVolume) {
    return { averageTicketExceedsVolume: { monthlyVolume, averageTicket } };
  }
  return null;
};
