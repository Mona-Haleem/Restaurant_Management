import { isValidTimeZone, localDate, localDayRanges, startOfLocalDay } from './local-day';

// B1101: report days are the tenant's local days (tenants.timezone), not UTC days.

describe('startOfLocalDay', () => {
  it('is local midnight as a UTC instant', () => {
    // Cairo is UTC+2 in November.
    expect(startOfLocalDay('2026-11-06', 'Africa/Cairo').toISOString()).toBe(
      '2026-11-05T22:00:00.000Z',
    );
    expect(startOfLocalDay('2026-11-06', 'UTC').toISOString()).toBe('2026-11-06T00:00:00.000Z');
    expect(startOfLocalDay('2026-11-06', 'America/New_York').toISOString()).toBe(
      '2026-11-06T05:00:00.000Z',
    );
  });

  it('follows daylight saving time', () => {
    // New York: EDT (UTC−4) until 2026-11-01 02:00, then EST (UTC−5).
    expect(startOfLocalDay('2026-11-01', 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(startOfLocalDay('2026-11-02', 'America/New_York').toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
  });

  it('starts at the first instant of the day when daylight saving begins at midnight', () => {
    // Cairo 2026-04-24: 00:00 EET jumps to 01:00 EEST, so the day starts at 01:00 local.
    expect(startOfLocalDay('2026-04-24', 'Africa/Cairo').toISOString()).toBe(
      '2026-04-23T22:00:00.000Z',
    );
    // Beirut 2026-03-29: the same jump at midnight.
    expect(startOfLocalDay('2026-03-29', 'Asia/Beirut').toISOString()).toBe(
      '2026-03-28T22:00:00.000Z',
    );
    // Cairo's autumn change (midnight happens twice): the day starts at the first midnight.
    const autumn = startOfLocalDay('2026-10-30', 'Africa/Cairo');
    expect(localDate(autumn, 'Africa/Cairo')).toBe('2026-10-30');
    expect(localDate(new Date(autumn.getTime() - 60_000), 'Africa/Cairo')).toBe('2026-10-29');
  });

  it('agrees with localDate on every day of a year in daylight-saving zones', () => {
    for (const zone of ['Africa/Cairo', 'Asia/Beirut', 'America/Santiago', 'America/Havana']) {
      for (const day of localDayRanges('2026-01-01', '2026-12-31', zone)) {
        expect(localDate(day.start, zone)).toBe(day.date);
        expect(localDate(new Date(day.start.getTime() - 60_000), zone)).not.toBe(day.date);
      }
    }
  });

  it('handles zones far from UTC', () => {
    expect(startOfLocalDay('2026-11-06', 'Pacific/Kiritimati').toISOString()).toBe(
      '2026-11-05T10:00:00.000Z',
    );
  });
});

describe('localDate', () => {
  it('is the local calendar date of an instant', () => {
    const lateUtc = new Date('2026-11-05T22:10:00Z');
    expect(localDate(lateUtc, 'UTC')).toBe('2026-11-05');
    expect(localDate(lateUtc, 'Africa/Cairo')).toBe('2026-11-06');
  });
});

describe('localDayRanges', () => {
  it('covers from..to inclusive, each day ending where the next begins', () => {
    const days = localDayRanges('2026-10-31', '2026-11-02', 'America/New_York');
    expect(days.map((d) => d.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(days[0]!.end).toEqual(days[1]!.start);
    expect(days[1]!.end).toEqual(days[2]!.start);
    // The day the clocks go back has 25 hours.
    expect(days[1]!.end.getTime() - days[1]!.start.getTime()).toBe(25 * 3_600_000);
  });

  it('is a single day when from equals to', () => {
    expect(localDayRanges('2026-11-06', '2026-11-06', 'UTC')).toHaveLength(1);
  });

  it('crosses month and year ends', () => {
    expect(localDayRanges('2026-12-31', '2027-01-01', 'UTC').map((d) => d.date)).toEqual([
      '2026-12-31',
      '2027-01-01',
    ]);
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and refuses others', () => {
    expect(isValidTimeZone('Africa/Cairo')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
