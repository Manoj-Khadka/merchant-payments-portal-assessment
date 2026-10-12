import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Pulsing placeholder rows used while a section loads. */
@Component({
  selector: 'app-loading-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loading-skeleton.component.html',
  styleUrl: './loading-skeleton.component.scss',
})
export class LoadingSkeletonComponent {
  readonly rows = input(3);
  protected readonly widths = [100, 82, 92, 68, 88, 74];
  protected readonly rowsList = computed(() => Array.from({ length: Math.max(1, this.rows()) }));
}
