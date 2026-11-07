/**
 * Local calendar days of a tenant (`tenants.timezone`, an IANA name) as UTC instants, so the
 * report queries can filter `timestamptz` columns by [start, end). Built on `Intl`, which knows
 * every zone's daylight-saving rules; no dependency. This is time arithmetic only — money and
 * stock never go through here.
 */

const MINUTE = 60_000;

function parts(instant: Date, timeZone: string): Record<string, number> {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const out: Record<string, number> = {};
  for (const p of formatted) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

/** Minutes the zone is ahead of UTC at `instant` (Cairo in November: 120). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / MINUTE);
}

function ymd(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

/** The instant local midnight starts `date` (YYYY-MM-DD) in `timeZone`. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const [y, m, d] = ymd(date);
  const wallClock = Date.UTC(y, m - 1, d);
  let guess = wallClock;
  // Two passes settle the offset in the usual case.
  for (let i = 0; i < 3; i++) {
    const next = wallClock - offsetMinutes(new Date(guess), timeZone) * MINUTE;
    if (next === guess) break;
    guess = next;
  }
  // Where daylight saving starts or ends at midnight (Cairo, Beirut), the passes can land an hour
  // off. Settle on the earliest instant whose local date is `date`; offsets are multiples of 15
  // minutes, so 15-minute steps are exact.
  const step = 15 * MINUTE;
  while (localDate(new Date(guess), timeZone) < date) guess += step;
  while (localDate(new Date(guess - step), timeZone) === date) guess -= step;
  return new Date(guess);
}

/** The local calendar date (YYYY-MM-DD) of an instant. */
export function localDate(instant: Date, timeZone: string): string {
  const p = parts(instant, timeZone);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month!)}-${pad(p.day!)}`;
}

/** The calendar day after `date` (YYYY-MM-DD). */
export function nextDate(date: string): string {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export interface LocalDay {
  date: string;
  /** Inclusive. */
  start: Date;
  /** Exclusive: the next day's start. */
  end: Date;
}

/** Every local day from `from` to `to`, both included. */
export function localDayRanges(from: string, to: string, timeZone: string): LocalDay[] {
  const days: LocalDay[] = [];
  let date = from;
  let start = startOfLocalDay(date, timeZone);
  while (date <= to) {
    const following = nextDate(date);
    const end = startOfLocalDay(following, timeZone);
    days.push({ date, start, end });
    date = following;
    start = end;
  }
  return days;
}

/** True for a calendar date that exists (2026-02-30 does not). */
export function isRealDate(date: string): boolean {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === date;
}

/** Days from `from` to `to`, both included (1 when they are equal). */
export function daysInRange(from: string, to: string): number {
  const [fy, fm, fd] = ymd(from);
  const [ty, tm, td] = ymd(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
