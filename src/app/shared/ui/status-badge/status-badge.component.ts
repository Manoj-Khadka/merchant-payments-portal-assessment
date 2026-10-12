import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AppStatus } from '../../../core/models/application.model';

/**
 * Status chip. Colour is never the only signal — the human-readable label is
 * always rendered next to it, so the badge is meaningful to colour-blind users
 * and screen readers alike.
 */
@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss',
})
export class StatusBadgeComponent {
  readonly status = input.required<AppStatus>();

  private static readonly LABELS: Record<AppStatus, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    IN_REVIEW: 'In review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
  };

  readonly label = computed(() => StatusBadgeComponent.LABELS[this.status()]);
}
