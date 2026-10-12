import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RiskDecision } from '../../../core/models/application.model';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { LoadingSkeletonComponent } from '../../../shared/ui/loading-skeleton/loading-skeleton.component';

/**
 * Read-only timeline of review decisions for one application. The data is
 * loaded by the parent from `GET /applications/:id/risk-history`, so this
 * component owns only the loading/empty/error presentation.
 */
@Component({
  selector: 'app-risk-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ErrorStateComponent, LoadingSkeletonComponent],
  templateUrl: './risk-history.component.html',
  styleUrl: './risk-history.component.scss',
})
export class RiskHistoryComponent {
  readonly decisions = input<RiskDecision[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  /** Optional id → display-name map so the timeline can show real names. */
  readonly reviewerNames = input<Record<string, string>>({});
  readonly retry = output<void>();

  protected reviewerName(id: string): string {
    return this.reviewerNames()[id] ?? id;
  }
}
