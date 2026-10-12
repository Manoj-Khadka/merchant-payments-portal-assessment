import { AsyncValidatorFn, FormArray, FormControl, FormGroup, ValidationErrors } from '@angular/forms';
import { Observable, firstValueFrom, of } from 'rxjs';
import { minimumAgeValidator } from './age.validator';
import { businessNameUnique, BusinessNameService } from './async-unique-name.validator';
import { einValidator } from './ein.validator';
import { ownershipTotal } from './ownership-total.validator';
import { processingRangeValidator } from './processing-range.validator';
import { routingNumberValidator } from './routing-number.validator';
import { urlValidator } from './url.validator';

function owner(pct: number): FormGroup {
  return new FormGroup({ ownershipPct: new FormControl(pct) });
}

describe('einValidator', () => {
  const validate = einValidator();

  it('accepts the 12-3456789 shape', () => {
    expect(validate(new FormControl('12-3456789'))).toBeNull();
  });

  it('rejects a bare 9-digit number', () => {
    expect(validate(new FormControl('123456789'))).toEqual({ ein: true });
  });

  it('lets an empty value fall through to `required`', () => {
    expect(validate(new FormControl(''))).toBeNull();
  });
});

describe('routingNumberValidator', () => {
  const validate = routingNumberValidator();

  it('accepts a valid ABA checksum', () => {
    expect(validate(new FormControl('021000021'))).toBeNull();
  });

  it('rejects a bad checksum', () => {
    expect(validate(new FormControl('123456789'))).toEqual({ routingNumber: true });
  });

  it('rejects the wrong length', () => {
    expect(validate(new FormControl('12345'))).toEqual({ routingNumber: true });
  });
});

describe('urlValidator', () => {
  const validate = urlValidator();

  it('accepts an https URL', () => {
    expect(validate(new FormControl('https://acme.example.com'))).toBeNull();
  });

  it('rejects a bare hostname', () => {
    expect(validate(new FormControl('acme.example.com'))).toEqual({ url: true });
  });
});

describe('ownershipTotal', () => {
  it('passes when the principals sum to 100', () => {
    const array = new FormArray([owner(60), owner(40)], ownershipTotal);
    expect(array.errors).toBeNull();
  });

  it('reports the running total when it is off', () => {
    const array = new FormArray([owner(60), owner(30)], ownershipTotal);
    expect(array.errors).toEqual({ ownershipTotal: { total: 90 } });
  });

  it('requires at least one owner', () => {
    const array = new FormArray([], ownershipTotal);
    expect(array.errors).toEqual({ ownershipTotal: { total: 0, required: true } });
  });
});

describe('minimumAgeValidator', () => {
  it('accepts an adult date of birth', () => {
    expect(minimumAgeValidator(18)(new FormControl('1980-01-01'))).toBeNull();
  });

  it('rejects a minor', () => {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const result = minimumAgeValidator(18)(
      new FormControl(fiveYearsAgo.toISOString().slice(0, 10)),
    );
    expect(result?.['minimumAge']?.['required']).toBe(18);
  });
});

describe('processingRangeValidator', () => {
  const build = (monthlyVolume: number, averageTicket: number) =>
    new FormGroup(
      {
        monthlyVolume: new FormControl(monthlyVolume),
        averageTicket: new FormControl(averageTicket),
      },
      processingRangeValidator,
    );

  it('passes when the average ticket fits inside the volume', () => {
    expect(build(100000, 250).errors).toBeNull();
  });

  it('rejects an average ticket larger than the volume', () => {
    expect(build(100, 500).errors).toEqual({
      averageTicketExceedsVolume: { monthlyVolume: 100, averageTicket: 500 },
    });
  });
});

describe('businessNameUnique (async)', () => {
  const service = { isTaken: (name: string) => of(name.trim().toLowerCase() === 'acme corp') } as
    Pick<BusinessNameService, 'isTaken'> as BusinessNameService;

  const run = (validator: AsyncValidatorFn, value: string) =>
    firstValueFrom(validator(new FormControl(value)) as Observable<ValidationErrors | null>);

  it('flags a name already on file', async () => {
    const result = await run(businessNameUnique(service, 0), 'Acme Corp');
    expect(result).toEqual({ businessNameTaken: true });
  });

  it('accepts an unused name', async () => {
    const result = await run(businessNameUnique(service, 0), 'Brand New Co');
    expect(result).toBeNull();
  });

  it('skips the check for an empty value', async () => {
    const result = await run(businessNameUnique(service, 0), '');
    expect(result).toBeNull();
  });
});
