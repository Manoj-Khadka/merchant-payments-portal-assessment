import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MerchantApplication } from '../../../core/models/application.model';
import { WizardPage } from './wizard.page';

const CREATE_URL = '/api/applications';

function blankApplication(): MerchantApplication {
  return {
    id: 'app_1',
    status: 'DRAFT',
    version: 1,
    businessName: '',
    createdBy: 'usr_sales',
    updatedAt: '2026-01-01T00:00:00.000Z',
    business: {
      legalName: '',
      dba: '',
      entityType: 'LLC',
      ein: '',
      website: '',
      address: {
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
      },
    },
    owners: [{ id: 'own_1', name: '', dob: '', ownershipPct: 0, ssnLast4: '' }],
    banking: {
      bankName: '',
      accountNumber: '',
      routingNumber: '',
      monthlyVolume: 0,
      averageTicket: 0,
    },
    documents: [],
  };
}

describe('WizardPage', () => {
  let fixture: ComponentFixture<WizardPage>;
  let controller: HttpTestingController;

  async function create(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [WizardPage],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WizardPage);
    controller = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    // The constructor requests a new draft; answer it and render the steps.
    const request = controller.expectOne(CREATE_URL);
    expect(request.request.method).toBe('POST');
    request.flush(blankApplication());
    fixture.detectChanges();
    await fixture.whenStable();

    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    controller.verify();
  });

  it('creates a draft on init and renders the wizard steps', async () => {
    const element = await create();

    expect(element.textContent).toContain('Step 1 of 4');
    expect(element.querySelector('#legalName')).toBeTruthy();
    expect(element.querySelectorAll('.step-heading').length).toBe(4);
  });

  it('blocks advancing and shows an error summary when the step is invalid', async () => {
    const element = await create();

    const next = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Next',
    );
    expect(next).toBeTruthy();
    next!.click();
    fixture.detectChanges();

    expect(element.querySelector('.error-summary')).toBeTruthy();
    expect(element.querySelector('.error-summary')?.textContent).toContain('Legal name');
  });

  it('marks the active step with aria-current', async () => {
    const element = await create();

    const current = element.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain('Business info');
  });
});
