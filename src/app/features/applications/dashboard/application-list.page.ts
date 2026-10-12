import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { PageEvent, MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppStatus } from '../../../core/models/application.model';
import { HasPermissionDirective } from '../../../core/permissions/has-permission.directive';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { LoadingSkeletonComponent } from '../../../shared/ui/loading-skeleton/loading-skeleton.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge/status-badge.component';
import { ApplicationFiltersComponent } from './application-filters.component';
import { ApplicationsStore, DEFAULT_QUERY } from './applications.store';

function numberOr(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Component({
  selector: 'app-application-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    ApplicationFiltersComponent,
    StatusBadgeComponent,
    ErrorStateComponent,
    LoadingSkeletonComponent,
    HasPermissionDirective,
  ],
  templateUrl: './application-list.page.html',
  styleUrl: './application-list.page.scss',
})
export class ApplicationListPage {
  protected readonly store = inject(ApplicationsStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly columns = ['business', 'status', 'version', 'updated', 'actions'];

  constructor() {
    // Read the initial state from the URL so the page is shareable and
    // refresh-safe. `open()` (rather than a direct query write) makes sure
    // re-entering the page always refetches, even with the same filters.
    const params = this.route.snapshot.queryParamMap;
    this.store.open({
      page: numberOr(params.get('page'), 1),
      pageSize: numberOr(params.get('pageSize'), DEFAULT_QUERY.pageSize),
      status: (params.get('status') as AppStatus | null) || null,
      q: params.get('q') ?? '',
      sort: params.get('sort') ?? DEFAULT_QUERY.sort,
    });

    // Keep the URL in sync as the query changes.
    effect(() => {
      const query = this.store.query();
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          page: query.page,
          pageSize: query.pageSize,
          status: query.status ?? undefined,
          q: query.q || undefined,
          sort: query.sort,
        },
        replaceUrl: true,
      });
    });
  }

  protected onPage(event: PageEvent): void {
    if (event.pageSize !== this.store.query().pageSize) {
      this.store.setPageSize(event.pageSize);
      return;
    }
    this.store.setPage(event.pageIndex + 1);
  }
}
