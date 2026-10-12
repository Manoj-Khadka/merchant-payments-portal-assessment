import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
}

/**
 * Confirmation dialog built on `MatDialog`. Material handles focus trapping,
 * `aria-modal`, Escape-to-close and restoring focus to the trigger, so the
 * component itself only owns the copy and the confirm/cancel result.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatDialogTitle, MatDialogContent, MatDialogActions],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ConfirmDialogComponent, boolean>>(MatDialogRef);

  protected close(result: boolean): void {
    this.ref.close(result);
  }
}
