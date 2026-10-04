// Weekly / monthly / yearly periods as Money Manager shows them, honouring a custom month start day
// (e.g. payday on the 25th) and week start (Sunday or Monday).

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export type PeriodKind = 'week' | 'month' | 'year';

export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
}

export interface PeriodPrefs {
  monthStartDay: number; // 1–28
  weekStart: 0 | 1;
}

function monthStart(year: number, monthIndex: number, startDay: number): Date {
  return new Date(year, monthIndex, startDay);
}

export function periodContaining(kind: PeriodKind, dateISO: string, prefs: PeriodPrefs): Period {
  const d = parseISO(dateISO);
  if (kind === 'week') {
    const from = startOfWeek(d, { weekStartsOn: prefs.weekStart });
    return { kind, from: iso(from), to: iso(addDays(from, 6)) };
  }
  const s = prefs.monthStartDay;
  if (kind === 'month') {
    let from = monthStart(d.getFullYear(), d.getMonth(), s);
    if (d < from) from = addMonths(from, -1);
    return { kind, from: iso(from), to: iso(addDays(addMonths(from, 1), -1)) };
  }
  let from = monthStart(d.getFullYear(), 0, s);
  if (d < from) from = addYears(from, -1);
  return { kind, from: iso(from), to: iso(addDays(addYears(from, 1), -1)) };
}

export function shiftPeriod(p: Period, n: number, prefs: PeriodPrefs): Period {
  const from = parseISO(p.from);
  const moved = p.kind === 'week' ? addWeeks(from, n) : p.kind === 'month' ? addMonths(from, n) : addYears(from, n);
  return periodContaining(p.kind, iso(moved), prefs);
}

/** Title for a period: "Oct 2026", "2026", or "5 Oct – 11 Oct". */
export function periodLabel(p: Period, prefs: PeriodPrefs): string {
  const from = parseISO(p.from);
  if (p.kind === 'year') return prefs.monthStartDay === 1 ? format(from, 'yyyy') : `${format(from, 'd MMM yyyy')} –`;
  if (p.kind === 'month') {
    if (prefs.monthStartDay === 1) return format(from, 'MMM yyyy');
    // Name a payday-style month after the month most of its days fall in.
    return format(prefs.monthStartDay > 15 ? addMonths(from, 1) : from, 'MMM yyyy');
  }
  return `${format(from, 'd MMM')} – ${format(parseISO(p.to), 'd MMM')}`;
}

export function rangeSubtitle(p: Period): string {
  return `${format(parseISO(p.from), 'd MMM')} – ${format(parseISO(p.to), 'd MMM yyyy')}`;
}

export function daysBetween(from: string, to: string): string[] {
  const start = parseISO(from);
  const n = differenceInCalendarDays(parseISO(to), start);
  return Array.from({ length: n + 1 }, (_, i) => iso(addDays(start, i)));
}

/** Weeks overlapping a period, clipped to it (for the Weekly view). */
export function weeksIn(p: Period, prefs: PeriodPrefs): Period[] {
  const out: Period[] = [];
  let w = periodContaining('week', p.from, prefs);
  while (w.from <= p.to) {
    out.push({ kind: 'week', from: w.from < p.from ? p.from : w.from, to: w.to > p.to ? p.to : w.to });
    w = shiftPeriod(w, 1, prefs);
  }
  return out;
}

/** The 12 months of a year period (for the Monthly view). */
export function monthsIn(year: Period, prefs: PeriodPrefs): Period[] {
  let m = periodContaining('month', year.from, prefs);
  return Array.from({ length: 12 }, () => {
    const cur = m;
    m = shiftPeriod(m, 1, prefs);
    return cur;
  });
}

export interface CalendarDay {
  date: string;
  inPeriod: boolean;
}

/** Calendar grid (rows of 7 days) covering a month period, padded to whole weeks. */
export function calendarGrid(p: Period, prefs: PeriodPrefs): CalendarDay[][] {
  const first = periodContaining('week', p.from, prefs).from;
  const last = periodContaining('week', p.to, prefs).to;
  const days = daysBetween(first, last).map((date) => ({ date, inPeriod: date >= p.from && date <= p.to }));
  const rows: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  return rows;
}

export function weekdayLabels(prefs: PeriodPrefs): string[] {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return [...names.slice(prefs.weekStart), ...names.slice(0, prefs.weekStart)];
}
