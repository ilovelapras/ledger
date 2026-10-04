import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from 'date-fns';

export const ISO = 'yyyy-MM-dd';

export function today(): string {
  return format(new Date(), ISO);
}

export function toISO(d: Date): string {
  return format(d, ISO);
}

export function fromISO(s: string): Date {
  return parseISO(s);
}

export function displayDate(s: string): string {
  return format(parseISO(s), 'd MMM yyyy');
}

export function startOfYearISO(s: string): string {
  return toISO(startOfYear(parseISO(s)));
}

export function dayBefore(s: string): string {
  return toISO(addDays(parseISO(s), -1));
}

/** The period of equal length immediately before [from, to]. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = parseISO(from);
  const days = differenceInCalendarDays(parseISO(to), f) + 1;
  return { from: toISO(addDays(f, -days)), to: toISO(addDays(f, -1)) };
}

export type RangePreset = 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'last_12_months' | 'all';

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'last_year', label: 'Last year' },
  { key: 'last_12_months', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
];

export function presetRange(preset: RangePreset, now = new Date()): { from: string; to: string } {
  switch (preset) {
    case 'this_month':
      return { from: toISO(startOfMonth(now)), to: toISO(endOfMonth(now)) };
    case 'last_month': {
      const m = subMonths(now, 1);
      return { from: toISO(startOfMonth(m)), to: toISO(endOfMonth(m)) };
    }
    case 'this_year':
      return { from: toISO(startOfYear(now)), to: toISO(endOfYear(now)) };
    case 'last_year': {
      const y = subYears(now, 1);
      return { from: toISO(startOfYear(y)), to: toISO(endOfYear(y)) };
    }
    case 'last_12_months':
      return { from: toISO(addDays(subYears(now, 1), 1)), to: toISO(now) };
    case 'all':
      return { from: '1900-01-01', to: '2999-12-31' };
  }
}
