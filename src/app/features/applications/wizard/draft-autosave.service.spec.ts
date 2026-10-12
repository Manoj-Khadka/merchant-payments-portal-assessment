import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Observable, map, of, throwError, timer } from 'rxjs';
import { ApiError } from '../../../core/http/error.interceptor';
import { MerchantApplication } from '../../../core/models/application.model';
import { ApplicationsApi } from '../applications.api';
import { DraftAutosaveService } from './draft-autosave.service';

const URL = '/api/applications/app_1/draft';

describe('DraftAutosaveService', () => {
  let service: DraftAutosaveService;
  let controller: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DraftAutosaveService);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function form(): FormGroup {
    return new FormGroup({ name: new FormControl(''), volume: new FormControl(0) });
  }

  it('debounces rapid edits into a single save', () => {
    const group = form();
    service.init(group, 'app_1', 1);

    group.get('name')!.setValue('a');
    group.get('name')!.setValue('ab');
    group.get('name')!.setValue('abc');

    // Still inside the debounce window: nothing has been sent yet.
    expect(controller.match(URL).length).toBe(0);

    vi.advanceTimersByTime(800);

    const request = controller.expectOne(URL);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({ version: 1, name: 'abc' });
    request.flush({ id: 'app_1', version: 2 });

    expect(service.saveState()).toBe('saved');
    controller.verify();
  });

  it('saves even while the form is invalid (getRawValue)', () => {
    const group = new FormGroup({
      name: new FormControl('Acme', Validators.required),
      volume: new FormControl(0),
    });
    service.init(group, 'app_1', 1);

    group.get('name')!.setValue(''); // required field now empty
    expect(group.invalid).toBe(true);
    vi.advanceTimersByTime(800);

    const request = controller.expectOne(URL);
    expect(request.request.body).toMatchObject({ name: '' });
    request.flush({ id: 'app_1', version: 2 });
    controller.verify();
  });

  it('sets an error, preserves the form value and keeps the stream alive after a failure', () => {
    const group = form();
    service.init(group, 'app_1', 1);

    group.get('name')!.setValue('first');
    vi.advanceTimersByTime(800);

    // The service retries twice (1s, then 2s) before giving up.
    controller.expectOne(URL).flush({}, { status: 500, statusText: 'Server Error' });
    vi.advanceTimersByTime(1000);
    controller.expectOne(URL).flush({}, { status: 500, statusText: 'Server Error' });
    vi.advanceTimersByTime(2000);
    controller.expectOne(URL).flush({}, { status: 500, statusText: 'Server Error' });

    expect(service.saveState()).toBe('error');
    expect(group.get('name')!.value).toBe('first');

    // The valueChanges stream must survive: a later edit saves normally.
    group.get('name')!.setValue('second');
    vi.advanceTimersByTime(800);

    const recovered = controller.expectOne(URL);
    recovered.flush({ id: 'app_1', version: 3 });

    expect(service.saveState()).toBe('saved');
    expect(service.lastSavedAt()).toBeInstanceOf(Date);
    controller.verify();
  });

  it('unsubscribes cleanly on destroy', () => {
    const group = form();
    service.init(group, 'app_1', 1);
    service.destroy();

    group.get('name')!.setValue('after destroy');
    vi.advanceTimersByTime(800);

    expect(controller.match(URL).length).toBe(0);
  });

  it('clears the pending flag when an edit returns to the last saved value', () => {
    const group = form();
    service.init(group, 'app_1', 1);

    // First save: "Acme".
    group.get('name')!.setValue('Acme');
    vi.advanceTimersByTime(800);
    controller.expectOne(URL).flush({ id: 'app_1', version: 2 });
    expect(service.hasPendingChanges()).toBe(false);

    // Type an extra character and delete it again, both inside the debounce
    // window, ending on exactly the value the server already has.
    group.get('name')!.setValue('Acme X');
    group.get('name')!.setValue('Acme');
    expect(service.hasPendingChanges()).toBe(true); // raised immediately

    vi.advanceTimersByTime(800);

    // Nothing to persist — and, crucially, the flag is cleared rather than left
    // stuck on (which would disable Submit until the next unrelated edit).
    expect(service.hasPendingChanges()).toBe(false);
    expect(controller.match(URL).length).toBe(0);
    controller.verify();
  });
});

/** A controllable stand-in for `ApplicationsApi` that records what it receives. */
class FakeAutosaveApi {
  readonly versions: number[] = [];
  readonly values: unknown[] = [];

  constructor(private readonly handler: (version: number) => Observable<MerchantApplication>) {}

  saveDraft(_id: string, value: unknown, version: number): Observable<MerchantApplication> {
    this.versions.push(version);
    this.values.push(value);
    return this.handler(version);
  }
}

describe('DraftAutosaveService (serialisation and retry policy)', () => {
  function setup(handler: (version: number) => Observable<MerchantApplication>) {
    const api = new FakeAutosaveApi(handler);
    TestBed.configureTestingModule({
      providers: [{ provide: ApplicationsApi, useValue: api }],
    });
    return { api, service: TestBed.inject(DraftAutosaveService) };
  }

  function form(): FormGroup {
    return new FormGroup({ name: new FormControl(''), volume: new FormControl(0) });
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('serialises overlapping saves and sends versions 0 then 1', () => {
    // Each save takes 1000ms — long enough for a later edit to overlap it.
    const { api, service } = setup((version) =>
      timer(1000).pipe(map(() => ({ version: version + 1 }) as MerchantApplication)),
    );
    const group = form();
    service.init(group, 'app_1', 0);

    group.get('name')!.setValue('a'); // t=0
    vi.advanceTimersByTime(800); // t=800: save #1 starts with version 0
    expect(api.versions).toEqual([0]);

    // A second edit while save #1 is still in flight.
    group.get('name')!.setValue('abc'); // t=800
    vi.advanceTimersByTime(800); // t=1600: debounce fires; save queued behind #1
    expect(api.versions).toEqual([0]);

    // Save #1 completes at t=1800; only then does queued save #2 start, and it
    // must read the version save #1 returned (1) rather than the stale 0.
    vi.advanceTimersByTime(200);
    expect(api.versions).toEqual([0, 1]);
    expect(service.conflict()).toBe(false);

    vi.advanceTimersByTime(1000); // save #2 completes
    expect(service.saveState()).toBe('saved');
    expect(service.conflict()).toBe(false);
  });

  it('re-saves a revert to the last saved value while a slow save is in flight', () => {
    // Each save takes 1000ms, so the first save is still in flight when the user
    // reverts the field.
    const { api, service } = setup((version) =>
      timer(1000).pipe(map(() => ({ version: version + 1 }) as MerchantApplication)),
    );
    const group = new FormGroup({ name: new FormControl('A') });
    service.init(group, 'app_1', 0);

    group.get('name')!.setValue('B'); // t=0
    vi.advanceTimersByTime(800); // t=800: save("B") starts with version 0
    expect(api.versions).toEqual([0]);

    // Revert to "A" while "B" is still in flight. The server has not confirmed
    // "B", so this is a real change and must be sent, not skipped as a duplicate.
    group.get('name')!.setValue('A'); // t=800
    vi.advanceTimersByTime(800); // t=1600: debounce fires; save("A") queued behind "B"
    expect(service.hasPendingChanges()).toBe(true);

    // Let both saves finish (B at t=1800, then queued A at t=2800).
    vi.advanceTimersByTime(3000);

    expect(api.values[api.values.length - 1]).toEqual({ name: 'A' });
    expect(api.versions).toEqual([0, 1]);
    expect(service.hasPendingChanges()).toBe(false);
    expect(service.saveState()).toBe('saved');
  });

  it('saves and clears pending when Retry is used after a failure', () => {
    let attempt = 0;
    const { api, service } = setup(() => {
      attempt += 1;
      // The first attempt fails deterministically (a 400 is never retried); the
      // manual retry then succeeds.
      return attempt === 1
        ? throwError(() => new ApiError(400, 'bad_request', 'Save failed.'))
        : of({ version: 5 } as MerchantApplication);
    });
    const group = form();
    service.init(group, 'app_1', 0);

    group.get('name')!.setValue('first');
    vi.advanceTimersByTime(800);

    expect(service.saveState()).toBe('error');
    expect(service.hasPendingChanges()).toBe(true);

    // Retry re-sends the current value through the same queue — no dummy edit and
    // no debounce wait.
    service.retry();

    expect(api.values[api.values.length - 1]).toEqual({ name: 'first', volume: 0 });
    // The failed write never advanced the version, so the retry reuses version 0.
    expect(api.versions).toEqual([0, 0]);
    expect(service.saveState()).toBe('saved');
    expect(service.hasPendingChanges()).toBe(false);
  });

  it('does not retry a 409, flags the conflict and lands in error', () => {
    const { api, service } = setup(() =>
      throwError(() => new ApiError(409, 'version_conflict', 'This draft was updated elsewhere.')),
    );
    const group = form();
    service.init(group, 'app_1', 0);

    group.get('name')!.setValue('a');
    vi.advanceTimersByTime(800);

    // Exactly one attempt: a 409 is deterministic, so retrying is pointless.
    expect(api.versions).toEqual([0]);
    expect(service.conflict()).toBe(true);
    expect(service.saveState()).toBe('error');

    // No delayed retries sneak in afterwards either.
    vi.advanceTimersByTime(5000);
    expect(api.versions).toEqual([0]);
  });
});
