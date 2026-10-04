// Repeat schedules (Money Manager "Repeat") and instalment splits.

import { addDays, addMonths, addWeeks, addYears, endOfMonth, format, parseISO } from 'date-fns';

export type Freq = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'month_end' | 'yearly';

export const FREQ_LABELS: Record<Freq, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
  month_end: 'End of every month',
  yearly: 'Every year',
};

export const FREQS = Object.keys(FREQ_LABELS) as Freq[];

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * The index-th occurrence (0 = start). Always computed from the start date, so a schedule
 * starting on the 31st lands on the last day of shorter months without drifting.
 */
export function occurrence(start: string, freq: Freq, index: number): string {
  const s = parseISO(start);
  switch (freq) {
    case 'daily':
      return iso(addDays(s, index));
    case 'weekly':
      return iso(addWeeks(s, index));
    case 'biweekly':
      return iso(addWeeks(s, index * 2));
    case 'monthly':
      return iso(addMonths(s, index));
    case 'month_end':
      return iso(endOfMonth(addMonths(s, index)));
    case 'yearly':
      return iso(addYears(s, index));
  }
}

/** Occurrences from `fromIndex` that are due on or before `today` (and not after `endDate`). */
export function dueOccurrences(
  start: string,
  freq: Freq,
  fromIndex: number,
  today: string,
  endDate: string | null,
  limit = 400
): { index: number; date: string }[] {
  const out: { index: number; date: string }[] = [];
  for (let i = fromIndex; out.length < limit; i++) {
    const date = occurrence(start, freq, i);
    if (date > today || (endDate && date > endDate)) break;
    out.push({ index: i, date });
  }
  return out;
}

/** Split a total into n monthly parts; the remainder (in minor units) goes on the last instalment. */
export function splitInstallments(total: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error('Instalments must be a whole number of months.');
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const each = Math.floor(abs / n);
  const parts = Array.from({ length: n }, () => each * sign);
  parts[n - 1] = (abs - each * (n - 1)) * sign;
  return parts;
}
