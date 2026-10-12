import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';

/** Inline error banner with an optional retry action. */
@Component({
  selector: 'app-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton],
  templateUrl: './error-state.component.html',
  styleUrl: './error-state.component.scss',
})
export class ErrorStateComponent {
  readonly title = input('Something went wrong');
  readonly message = input<string | null>(null);
  readonly showRetry = input(true);
  readonly retry = output<void>();
}
