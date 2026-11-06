import { plainToInstance } from 'class-transformer';
import { IsString, Length, validateSync } from 'class-validator';
import { IsOptionalNotNull, Trim } from './optional';

class Probe {
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @Length(1, 10)
  name?: string;
}

const check = (input: Record<string, unknown>) => {
  const probe = plainToInstance(Probe, input);
  return { name: probe.name, errors: validateSync(probe).map((e) => e.property) };
};

describe('IsOptionalNotNull + Trim', () => {
  it('skips a missing field', () => {
    expect(check({})).toEqual({ name: undefined, errors: [] });
  });

  it('refuses an explicit null', () => {
    expect(check({ name: null }).errors).toEqual(['name']);
  });

  it('trims, and refuses a blank string', () => {
    expect(check({ name: '  Pizza ' })).toEqual({ name: 'Pizza', errors: [] });
    expect(check({ name: '   ' }).errors).toEqual(['name']);
  });

  it('leaves non-strings alone for the type check to refuse', () => {
    expect(check({ name: 5 })).toEqual({ name: 5, errors: ['name'] });
  });
});
