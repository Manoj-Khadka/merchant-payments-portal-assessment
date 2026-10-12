import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PermissionService } from '../../../core/permissions/permission.service';
import { SensitiveDataService } from '../../../features/applications/detail/sensitive-data.service';
import { MaskedFieldComponent } from './masked-field.component';

const APP = 'app_1';
const URL = `/api/applications/${APP}/reveal`;

function fakePermissions(allowed: boolean): Partial<PermissionService> {
  return { can: () => signal(allowed) };
}

describe('MaskedFieldComponent', () => {
  let controller: HttpTestingController;

  function create(allowed: boolean): ComponentFixture<MaskedFieldComponent> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        SensitiveDataService,
        { provide: PermissionService, useValue: fakePermissions(allowed) },
      ],
    });
    controller = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(MaskedFieldComponent);
    fixture.componentRef.setInput('value', '••••6789');
    fixture.componentRef.setInput('fieldKey', 'accountNumber');
    fixture.componentRef.setInput('applicationId', APP);
    fixture.componentRef.setInput('label', 'bank account number');
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const text = (fixture: ComponentFixture<MaskedFieldComponent>) =>
    fixture.nativeElement.textContent as string;
  const button = (fixture: ComponentFixture<MaskedFieldComponent>) =>
    fixture.nativeElement.querySelector('button') as HTMLButtonElement | null;

  it('is masked by default and offers no reveal button without permission', () => {
    const fixture = create(false);

    expect(text(fixture)).toContain('••••6789');
    expect(button(fixture)).toBeNull();
  });

  it('reveals through the server when permitted, then re-masks after 30s', () => {
    const fixture = create(true);

    const reveal = button(fixture)!;
    expect(reveal.getAttribute('aria-label')).toBe('Reveal bank account number');
    expect(reveal.getAttribute('aria-pressed')).toBe('false');

    reveal.click();

    const request = controller.expectOne(URL);
    expect(request.request.method).toBe('POST');
    request.flush({
      ein: '00-0000000',
      routingNumber: '021000021',
      accountNumber: '000123456789',
      owners: [],
    });
    fixture.detectChanges();

    expect(text(fixture)).toContain('000123456789');
    expect(button(fixture)!.getAttribute('aria-pressed')).toBe('true');
    expect(button(fixture)!.getAttribute('aria-label')).toBe('Hide bank account number');

    // After the TTL the value is dropped from memory and re-masked.
    vi.advanceTimersByTime(30_000);
    fixture.detectChanges();

    expect(text(fixture)).toContain('••••6789');
    expect(text(fixture)).not.toContain('000123456789');

    controller.verify();
  });

  it('reuses one server call when several fields are revealed together', () => {
    const fixture = create(true);

    button(fixture)!.click();
    const request = controller.expectOne(URL);
    request.flush({
      ein: '00-0000000',
      routingNumber: '021000021',
      accountNumber: '000123456789',
      owners: [],
    });
    fixture.detectChanges();

    // Hide, then reveal again: without a cached value it must re-request.
    button(fixture)!.click(); // clear
    fixture.detectChanges();
    expect(text(fixture)).toContain('••••6789');

    button(fixture)!.click();
    controller.expectOne(URL).flush({
      ein: '00-0000000',
      routingNumber: '021000021',
      accountNumber: '000123456789',
      owners: [],
    });
    controller.verify();
  });
});
