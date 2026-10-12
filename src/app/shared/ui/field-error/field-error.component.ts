import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';

/**
 * Reusable validation message. Subscribes to the control's events so it works
 * with OnPush, shows a "checking" state for async validators, and renders an
 * element whose `id` can be referenced from the input's `aria-describedby`.
 */
@Component({
  selector: 'app-field-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './field-error.component.html',
})
export class FieldErrorComponent {
  readonly label = input('');
  readonly control = input.required<AbstractControl | null>();
  /** Element id, referenced by the owning input's `aria-describedby`. */
  readonly errorId = input<string | null>(null);

  private readonly messageSignal = signal<string | null>(null);
  private readonly pendingSignal = signal(false);

  readonly message = this.messageSignal.asReadonly();
  readonly pending = this.pendingSignal.asReadonly();

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      if (!control) {
        this.messageSignal.set(null);
        this.pendingSignal.set(false);
        return;
      }

      const update = () => {
        this.pendingSignal.set(control.pending);
        this.messageSignal.set(control.errors && control.touched ? this.describe(control) : null);
      };

      update();
      const subscription = control.events.subscribe(update);
      onCleanup(() => subscription.unsubscribe());
    });
  }

  private describe(control: AbstractControl): string | null {
    const errors = control.errors;
    if (!errors) return null;

    const label = this.label() || 'This field';
    if (errors['required']) return `${label} is required.`;
    if (errors['email']) return 'Enter a valid email address.';
    if (errors['ein']) return 'Use the format 12-3456789.';
    if (errors['routingNumber']) return 'Enter a valid 9-digit routing number.';
    if (errors['url']) return 'Enter a valid URL (https://…).';
    if (errors['minlength']) return `${label} must be at least ${errors['minlength'].requiredLength} characters.`;
    if (errors['min']) return `Value must be at least ${errors['min'].min}.`;
    if (errors['max']) return `Value must be at most ${errors['max'].max}.`;
    if (errors['pattern']) return `${label} has an invalid format.`;
    if (errors['minimumAge']) return `Must be at least ${errors['minimumAge'].required} years old.`;
    if (errors['businessNameTaken']) return 'That business name is already registered.';
    if (errors['ownershipTotal']) return 'Ownership percentages must total 100%.';
    if (errors['averageTicketExceedsVolume'])
      return 'Average ticket cannot exceed the monthly volume.';
    return `${label} is invalid.`;
  }
}
