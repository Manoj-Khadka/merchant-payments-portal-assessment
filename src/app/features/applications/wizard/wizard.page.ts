import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { StepperSelectionEvent } from '@angular/cdk/stepper';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/http/error.interceptor';
import { MerchantApplication, Owner } from '../../../core/models/application.model';
import { einValidator } from '../../../shared/validators/ein.validator';
import { urlValidator } from '../../../shared/validators/url.validator';
import {
  BusinessNameService,
  businessNameUnique,
} from '../../../shared/validators/async-unique-name.validator';
import { minimumAgeValidator } from '../../../shared/validators/age.validator';
import { ownershipTotal } from '../../../shared/validators/ownership-total.validator';
import { processingRangeValidator } from '../../../shared/validators/processing-range.validator';
import { routingNumberValidator } from '../../../shared/validators/routing-number.validator';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { LoadingSkeletonComponent } from '../../../shared/ui/loading-skeleton/loading-skeleton.component';
import { ApplicationsApi } from '../applications.api';
import { DraftAutosaveService } from './draft-autosave.service';
import { BusinessStepComponent } from './steps/business-step.component';
import { OwnershipStepComponent } from './steps/ownership-step.component';
import { BankingStepComponent } from './steps/banking-step.component';
import { ReviewStepComponent } from './steps/review-step.component';

interface SummaryItem {
  label: string;
  id: string | null;
  step: number;
}

@Component({
  selector: 'app-wizard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatStepperModule,
    MatButtonModule,
    MatCardModule,
    BusinessStepComponent,
    OwnershipStepComponent,
    BankingStepComponent,
    ReviewStepComponent,
    ErrorStateComponent,
    LoadingSkeletonComponent,
  ],
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
  templateUrl: './wizard.page.html',
  styleUrl: './wizard.page.scss',
})
export class WizardPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(ApplicationsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly businessNameService = inject(BusinessNameService);

  protected readonly autosave = inject(DraftAutosaveService);
  protected readonly editing = this.route.snapshot.paramMap.has('id');
  protected readonly stepCount = 4;

  protected readonly step = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly errorSummary = signal<SummaryItem[]>([]);

  private readonly applicationId = signal<string | null>(null);
  private readonly stepperRef = viewChild(MatStepper);

  /**
   * Maps a control path to the label/id/step used by the error summary, so a
   * failed step can point the user straight at the offending input.
   */
  private readonly fieldIndex: Record<string, { label: string; id: string; step: number }> = {
    'business.legalName': { label: 'Legal name', id: 'legalName', step: 0 },
    'business.entityType': { label: 'Entity type', id: 'entityType', step: 0 },
    'business.ein': { label: 'EIN', id: 'ein', step: 0 },
    'business.website': { label: 'Website', id: 'website', step: 0 },
    'business.address.line1': { label: 'Address line 1', id: 'line1', step: 0 },
    'business.address.city': { label: 'City', id: 'city', step: 0 },
    'business.address.state': { label: 'State', id: 'state', step: 0 },
    'business.address.postalCode': { label: 'Postal code', id: 'postalCode', step: 0 },
    'business.address.country': { label: 'Country', id: 'country', step: 0 },
    'banking.bankName': { label: 'Bank name', id: 'bankName', step: 2 },
    'banking.accountNumber': { label: 'Account number', id: 'accountNumber', step: 2 },
    'banking.routingNumber': { label: 'Routing number', id: 'routingNumber', step: 2 },
    'banking.monthlyVolume': { label: 'Monthly volume', id: 'monthlyVolume', step: 2 },
    'banking.averageTicket': { label: 'Average ticket', id: 'averageTicket', step: 2 },
  };

  private readonly ownerIdPart: Record<string, string> = {
    name: 'name',
    dob: 'dob',
    ownershipPct: 'pct',
    ssnLast4: 'ssn',
  };

  private readonly ownerLabel: Record<string, string> = {
    name: 'Name',
    dob: 'Date of birth',
    ownershipPct: 'Ownership %',
    ssnLast4: 'SSN',
  };

  protected readonly form = this.fb.group({
    business: this.fb.group({
      legalName: this.fb.control('', {
        validators: [Validators.required],
        asyncValidators: [businessNameUnique(this.businessNameService)],
      }),
      dba: this.fb.control(''),
      entityType: this.fb.control('LLC', Validators.required),
      ein: this.fb.control('', [Validators.required, einValidator()]),
      website: this.fb.control('', [urlValidator()]),
      address: this.fb.group({
        line1: this.fb.control('', Validators.required),
        line2: this.fb.control(''),
        city: this.fb.control('', Validators.required),
        state: this.fb.control('', Validators.required),
        postalCode: this.fb.control('', Validators.required),
        country: this.fb.control('US', Validators.required),
      }),
    }),
    owners: this.fb.array(
      [this.ownerGroup()],
      ownershipTotal,
    ),
    banking: this.fb.group(
      {
        bankName: this.fb.control('', Validators.required),
        accountNumber: this.fb.control('', Validators.required),
        routingNumber: this.fb.control('', [Validators.required, routingNumberValidator]),
        monthlyVolume: this.fb.control(0, [Validators.required, Validators.min(0)]),
        averageTicket: this.fb.control(0, [Validators.required, Validators.min(0)]),
      },
      { validators: processingRangeValidator },
    ),
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadDraft(id);
    } else {
      this.createDraft();
    }
  }

  protected get businessGroup(): FormGroup {
    return this.form.get('business') as FormGroup;
  }

  protected get ownershipArray(): FormArray {
    return this.form.get('owners') as FormArray;
  }

  protected get bankingGroup(): FormGroup {
    return this.form.get('banking') as FormGroup;
  }

  protected reviewValue(): Record<string, unknown> {
    return this.form.getRawValue() as Record<string, unknown>;
  }

  protected onStepChange(event: StepperSelectionEvent): void {
    this.step.set(event.selectedIndex);
    this.focusStepHeading(event.selectedIndex);
  }

  protected next(): void {
    const index = this.step();
    if (!this.isStepValid(index)) {
      this.markStepTouched(index);
      this.goToField(this.buildSummary()[0]);
      return;
    }
    this.errorSummary.set([]);
    this.stepperRef()?.next();
  }

  protected back(): void {
    this.stepperRef()?.previous();
  }

  protected goTo(index: number): void {
    if (index === this.step()) return;
    this.errorSummary.set([]);

    if (index > this.step()) {
      for (let i = this.step(); i < index; i++) {
        if (!this.isStepValid(i)) {
          this.markStepTouched(i);
          this.goToField(this.buildSummary()[0]);
          return;
        }
      }
    }

    const stepper = this.stepperRef();
    if (stepper) stepper.selectedIndex = index;
  }

  /** Used by the error summary: jump to the failing step and focus the field. */
  protected goToField(item: SummaryItem | undefined): void {
    const step = item?.step ?? this.step();
    if (step !== this.step()) {
      const stepper = this.stepperRef();
      if (stepper) stepper.selectedIndex = step;
    }

    // Wait for change detection to lift `inert` off the target step, then focus.
    setTimeout(() => {
      if (typeof document === 'undefined') return;
      const element = item?.id ? document.getElementById(item.id) : null;
      (element ?? document.getElementById(`wizard-step-${step}`))?.focus();
    }, 0);
  }

  protected submit(): void {
    // Never submit while an edit is still being saved: the server would get the
    // previous version of the draft.
    if (this.submitting() || this.autosave.hasPendingChanges()) return;

    this.errorSummary.set([]);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.goToField(this.buildSummary()[0]);
      return;
    }

    const id = this.applicationId();
    if (!id) return;

    this.submitting.set(true);
    this.submitError.set(null);

    this.api
      .submit(id)
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (application) => {
          this.autosave.reset();
          void this.router.navigate(['/applications', application.id]);
        },
        error: (error: unknown) => this.submitError.set(this.errorMessage(error)),
      });
  }

  protected reload(): void {
    const id = this.applicationId();
    this.loading.set(true);
    this.loadError.set(null);
    if (id) {
      this.loadDraft(id);
    } else {
      this.createDraft();
    }
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  hasUnsavedChanges(): boolean {
    const state = this.autosave.saveState();
    return state === 'saving' || state === 'error';
  }

  private isStepValid(index: number): boolean {
    switch (index) {
      case 0:
        return this.businessGroup.valid;
      case 1:
        return this.ownershipArray.valid;
      case 2:
        return this.bankingGroup.valid;
      default:
        return this.form.valid;
    }
  }

  private markStepTouched(index: number): void {
    switch (index) {
      case 0:
        this.businessGroup.markAllAsTouched();
        break;
      case 1:
        this.ownershipArray.markAllAsTouched();
        break;
      case 2:
        this.bankingGroup.markAllAsTouched();
        break;
      default:
        this.form.markAllAsTouched();
    }
  }

  private focusStepHeading(index: number): void {
    setTimeout(() => {
      if (typeof document === 'undefined') return;
      document.getElementById(`wizard-step-${index}`)?.focus();
    }, 0);
  }

  private buildSummary(): SummaryItem[] {
    const items: SummaryItem[] = [];

    const visit = (control: AbstractControl, path: string, step: number): void => {
      if (control instanceof FormArray) return;
      if (control instanceof FormGroup) {
        for (const [name, child] of Object.entries(control.controls)) {
          visit(child, path ? `${path}.${name}` : name, step);
        }
        return;
      }
      if (control.invalid && control.touched) {
        const meta = this.fieldIndex[path];
        if (meta) items.push({ label: meta.label, id: meta.id, step: meta.step });
      }
    };

    visit(this.businessGroup, 'business', 0);
    visit(this.bankingGroup, 'banking', 2);

    this.ownershipArray.controls.forEach((control, index) => {
      const group = control as FormGroup;
      for (const [name, child] of Object.entries(group.controls)) {
        if (name === 'id') continue;
        if (this.ownerLabel[name] && child.invalid && child.touched) {
          items.push({
            label: `${this.ownerLabel[name]} (owner ${index + 1})`,
            id: `owner-${this.ownerIdPart[name]}-${index}`,
            step: 1,
          });
        }
      }
    });

    if (this.ownershipArray.hasError('ownershipTotal') && this.ownershipArray.touched) {
      items.unshift({ label: 'Ownership percentages must total 100%', id: null, step: 1 });
    }

    if (this.bankingGroup.hasError('averageTicketExceedsVolume')) {
      items.push({
        label: 'Average ticket cannot exceed the monthly volume',
        id: 'averageTicket',
        step: 2,
      });
    }

    this.errorSummary.set(items);
    return items;
  }

  private createDraft(): void {
    this.api
      .create()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (application) => this.onApplicationLoaded(application),
        error: (error: unknown) => {
          this.loading.set(false);
          this.loadError.set(this.errorMessage(error));
        },
      });
  }

  private loadDraft(id: string): void {
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (application) => this.onApplicationLoaded(application, true),
        error: (error: unknown) => {
          this.loading.set(false);
          this.loadError.set(this.errorMessage(error));
        },
      });
  }

  private onApplicationLoaded(application: MerchantApplication, patch = false): void {
    if (patch) {
      this.patchForm(application);
    }
    this.applicationId.set(application.id);
    this.loading.set(false);
    this.autosave.init(this.form, application.id, application.version, this.destroyRef);
  }

  private patchForm(application: MerchantApplication): void {
    this.form.patchValue(
      { business: application.business, banking: application.banking },
      { emitEvent: false },
    );

    this.form.setControl(
      'owners',
      this.fb.array(
        (application.owners ?? []).map((owner) => this.ownerGroup(owner)),
        ownershipTotal,
      ),
      { emitEvent: false },
    );
  }

  private ownerGroup(owner: Partial<Owner> = {}): FormGroup {
    return this.fb.group({
      id: this.fb.control(owner.id ?? ''),
      name: this.fb.control(owner.name ?? '', Validators.required),
      dob: this.fb.control(owner.dob ?? '', [Validators.required, minimumAgeValidator(18)]),
      ownershipPct: this.fb.control(owner.ownershipPct ?? 0, [
        Validators.required,
        Validators.min(0),
        Validators.max(100),
      ]),
      ssnLast4: this.fb.control(owner.ssnLast4 ?? '', [
        Validators.required,
        Validators.pattern(/^\d{4}$/),
      ]),
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof ApiError ? error.message : 'Something went wrong. Please retry.';
  }
}
