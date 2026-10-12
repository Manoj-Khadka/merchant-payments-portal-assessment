import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  BankingSection,
  BusinessSection,
  Owner,
} from '../../../../core/models/application.model';

@Component({
  selector: 'app-review-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatCardModule, MatButtonModule],
  templateUrl: './review-step.component.html',
  styleUrl: './review-step.component.scss',
})
export class ReviewStepComponent {
  readonly value = input.required<Record<string, unknown>>();
  readonly edit = output<number>();

  protected business(): BusinessSection {
    return this.value()['business'] as BusinessSection;
  }

  protected owners(): Owner[] {
    return (this.value()['owners'] as Owner[]) ?? [];
  }

  protected banking(): BankingSection {
    return this.value()['banking'] as BankingSection;
  }

  protected ownershipTotal(): number {
    return this.owners().reduce((sum, owner) => sum + (Number(owner.ownershipPct) || 0), 0);
  }
}
