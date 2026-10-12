import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/error.interceptor';
import {
  ApplicationDocument,
  DocumentStatus,
  MerchantApplication,
  RiskDecision,
} from '../../../core/models/application.model';
import { User } from '../../../core/models/user.model';
import { PermissionService } from '../../../core/permissions/permission.service';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { LoadingSkeletonComponent } from '../../../shared/ui/loading-skeleton/loading-skeleton.component';
import { MaskedFieldComponent } from '../../../shared/ui/masked-field/masked-field.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge/status-badge.component';
import { ApplicationsApi } from '../applications.api';
import { RiskHistoryComponent } from './risk-history.component';
import { DecisionDraft, ReviewPanelComponent } from './review-panel.component';
import { SensitiveDataService } from './sensitive-data.service';

type DetailState = 'loading' | 'error' | 'forbidden' | 'not-found' | 'ready';
type SectionState = 'loading' | 'error' | 'ready';

@Component({
  selector: 'app-application-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SensitiveDataService],
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    StatusBadgeComponent,
    ErrorStateComponent,
    LoadingSkeletonComponent,
    RiskHistoryComponent,
    ReviewPanelComponent,
    MaskedFieldComponent,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  templateUrl: './application-detail.page.html',
  styleUrl: './application-detail.page.scss',
})
export class ApplicationDetailPage {
  private readonly api = inject(ApplicationsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly dialog = inject(MatDialog);

  protected readonly application = signal<MerchantApplication | null>(null);
  protected readonly state = signal<DetailState>('loading');
  protected readonly error = signal<string | null>(null);

  protected readonly riskHistory = signal<RiskDecision[]>([]);
  protected readonly historyState = signal<SectionState>('loading');
  protected readonly historyError = signal<string | null>(null);

  protected readonly deciding = signal(false);
  protected readonly assigning = signal(false);
  protected readonly reviewers = signal<User[]>([]);
  protected readonly assignedReviewerId = signal('');

  protected readonly canManageAssignment = this.permissions.can('assignment:manage');

  protected readonly documents = computed<ApplicationDocument[]>(
    () => this.application()?.documents ?? [],
  );

  /**
   * The review panel is only for the *assigned* reviewer of an application that
   * is actively `IN_REVIEW`. Role permission alone is not enough.
   */
  protected readonly showReviewPanel = computed(() => {
    const app = this.application();
    const user = this.auth.user();
    return (
      !!app &&
      !!user &&
      app.status === 'IN_REVIEW' &&
      app.assignedReviewerId === user.id &&
      this.permissions.can('application:review')()
    );
  });

  /**
   * Drafts can only be opened in the wizard by their owning SALES user.
   */
  protected readonly canEditDraft = computed(() => {
    const app = this.application();
    const user = this.auth.user();
    return (
      !!app &&
      !!user &&
      app.status === 'DRAFT' &&
      app.createdBy === user.id &&
      this.permissions.can('application:edit')()
    );
  });

  protected readonly reviewerNames = computed<Record<string, string>>(() => {
    const names: Record<string, string> = {};
    const current = this.auth.user();
    if (current) names[current.id] = current.name;
    for (const reviewer of this.reviewers()) names[reviewer.id] = reviewer.name;
    return names;
  });

  constructor() {
    const id = this.id();
    if (id) {
      this.load(id);
      this.loadRiskHistory(id);
      if (this.canManageAssignment()) this.loadReviewers();
    }
  }

  protected reload(): void {
    const id = this.id();
    if (!id) return;
    this.load(id);
    this.loadRiskHistory(id);
  }

  protected loadRiskHistory(id = this.id()): void {
    if (!id) return;
    this.historyState.set('loading');
    this.historyError.set(null);
    this.api
      .riskHistory(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decisions) => {
          this.riskHistory.set(decisions);
          this.historyState.set('ready');
        },
        error: (error: unknown) => {
          this.historyError.set(this.errorMessage(error));
          this.historyState.set('error');
        },
      });
  }

  protected requestDecision(draft: DecisionDraft): void {
    const data: ConfirmDialogData = {
      title: draft.decision === 'REJECT' ? 'Reject application?' : 'Approve application?',
      message:
        draft.decision === 'REJECT'
          ? `This will reject the application. Reason: “${draft.reason}”`
          : 'This will approve the application and close the review.',
      confirmLabel: draft.decision === 'REJECT' ? 'Reject application' : 'Approve application',
    };

    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.confirmDecision(draft);
      });
  }

  protected confirmDecision(draft: DecisionDraft): void {
    const id = this.id();
    if (!id) return;
    this.deciding.set(true);
    this.api
      .decide(id, draft.decision, draft.reason)
      .pipe(
        finalize(() => this.deciding.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (application) => {
          this.application.set(application);
          this.loadRiskHistory();
        },
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  protected assign(): void {
    const id = this.id();
    const reviewerId = this.assignedReviewerId();
    if (!id || !reviewerId) return;
    this.assigning.set(true);
    this.api
      .assign(id, reviewerId)
      .pipe(
        finalize(() => this.assigning.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (application) => this.application.set(application),
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  protected documentStatusLabel(status: DocumentStatus): string {
    return status === 'VERIFIED' ? 'Verified' : status === 'REJECTED' ? 'Rejected' : 'Pending';
  }

  protected documentBadge(status: DocumentStatus): string {
    return status === 'VERIFIED'
      ? 'chip--success'
      : status === 'REJECTED'
        ? 'chip--danger'
        : 'chip--neutral';
  }

  private id(): string | null {
    return this.route.snapshot.paramMap.get('id');
  }

  private load(id: string): void {
    this.state.set('loading');
    this.error.set(null);
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (application) => {
          this.application.set(application);
          this.assignedReviewerId.set(application.assignedReviewerId ?? '');
          this.state.set('ready');
        },
        error: (error: unknown) => {
          if (error instanceof ApiError && error.status === 403) {
            this.state.set('forbidden');
          } else if (error instanceof ApiError && error.status === 404) {
            this.state.set('not-found');
          } else {
            this.error.set(this.errorMessage(error));
            this.state.set('error');
          }
        },
      });
  }

  private loadReviewers(): void {
    this.api
      .listReviewers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reviewers) => this.reviewers.set(reviewers),
        error: () => this.reviewers.set([]),
      });
  }

  private errorMessage(error: unknown): string {
    return error instanceof ApiError ? error.message : 'Something went wrong. Please retry.';
  }
}
