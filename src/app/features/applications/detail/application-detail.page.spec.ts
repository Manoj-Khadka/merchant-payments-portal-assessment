import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { MerchantApplication } from '../../../core/models/application.model';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ApplicationsApi } from '../applications.api';
import { ApplicationDetailPage } from './application-detail.page';

const APPLICATION: MerchantApplication = {
  id: 'app_1',
  status: 'IN_REVIEW',
  version: 6,
  businessName: 'Globex LLC',
  createdBy: 'usr_sales',
  assignedReviewerId: 'usr_reviewer',
  updatedAt: '2026-10-07T11:05:00.000Z',
  business: {
    legalName: 'Globex LLC',
    dba: 'Globex',
    entityType: 'LLC',
    ein: '•••••5667',
    website: '',
    address: { line1: '1 Springfield Way', city: 'Springfield', state: 'IL', postalCode: '62701', country: 'US' },
  },
  owners: [],
  banking: { bankName: 'Heartland Bank', routingNumber: '••••0032', accountNumber: '••••9911', monthlyVolume: 1, averageTicket: 1 },
  documents: [],
};

const API_STUB = {
  get: () => of(APPLICATION),
  riskHistory: () => of([]),
  documents: () => of([]),
  listReviewers: () => of([]),
  decide: () => of(APPLICATION),
  assign: () => of(APPLICATION),
  reveal: () => of({ ein: '33-4455667', routingNumber: '081000032', accountNumber: '444300099911', owners: [] }),
};

function render(role: 'SALES' | 'REVIEWER' | 'ADMIN', userId: string): ComponentFixture<ApplicationDetailPage> {
  const authStub = {
    user: signal({ id: userId, name: 'Test User', role, email: 'test@example.com' }),
    role: signal(role),
    isAuthenticated: () => true,
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      PermissionService,
      { provide: AuthService, useValue: authStub },
      { provide: ApplicationsApi, useValue: API_STUB },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 'app_1' }, queryParamMap: { get: () => null } } },
      },
    ],
  });

  const fixture = TestBed.createComponent(ApplicationDetailPage);
  fixture.detectChanges();
  return fixture;
}

describe('ApplicationDetailPage — permission-aware review panel', () => {
  it('hides the review panel from a SALES user', () => {
    const fixture = render('SALES', 'usr_sales');
    expect(fixture.nativeElement.textContent).toContain('Globex LLC');
    expect(fixture.nativeElement.querySelector('app-review-panel')).toBeNull();
  });

  it('hides the review panel from a REVIEWER it is not assigned to', () => {
    const fixture = render('REVIEWER', 'usr_reviewer2');
    expect(fixture.nativeElement.querySelector('app-review-panel')).toBeNull();
  });

  it('shows the review panel to the assigned reviewer of an IN_REVIEW application', () => {
    const fixture = render('REVIEWER', 'usr_reviewer');
    expect(fixture.nativeElement.querySelector('app-review-panel')).toBeTruthy();
  });

  it('shows the assignment controls to an ADMIN', () => {
    const fixture = render('ADMIN', 'usr_admin');
    expect(fixture.nativeElement.textContent).toContain('Assignment');
  });

  it('hides the assignment controls from a reviewer', () => {
    const fixture = render('REVIEWER', 'usr_reviewer');
    expect(fixture.nativeElement.textContent).not.toContain('Assignment');
  });
});
