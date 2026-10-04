// Credit card statement cycle: what's due now (balance payable) vs spending since the last statement.

import { addMonths, format, getDaysInMonth, parseISO } from 'date-fns';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

function dayIn(year: number, monthIndex: number, day: number): Date {
  const d = new Date(year, monthIndex, 1);
  return new Date(year, monthIndex, Math.min(day, getDaysInMonth(d)));
}

/** Most recent statement closing date on or before `today` (day 31 = month end). */
export function lastStatementClose(today: string, statementDay: number): string {
  const t = parseISO(today);
  const thisMonth = dayIn(t.getFullYear(), t.getMonth(), statementDay);
  if (thisMonth <= t) return iso(thisMonth);
  const prev = addMonths(new Date(t.getFullYear(), t.getMonth(), 1), -1);
  return iso(dayIn(prev.getFullYear(), prev.getMonth(), statementDay));
}

export function nextStatementClose(today: string, statementDay: number): string {
  const last = parseISO(lastStatementClose(today, statementDay));
  const next = addMonths(new Date(last.getFullYear(), last.getMonth(), 1), 1);
  return iso(dayIn(next.getFullYear(), next.getMonth(), statementDay));
}

/** Payment due date for a statement that closed on `close`. */
export function paymentDueAfter(close: string, paymentDay: number): string {
  const c = parseISO(close);
  const same = dayIn(c.getFullYear(), c.getMonth(), paymentDay);
  if (same > c) return iso(same);
  const next = addMonths(new Date(c.getFullYear(), c.getMonth(), 1), 1);
  return iso(dayIn(next.getFullYear(), next.getMonth(), paymentDay));
}

export interface CardStatus {
  lastClose: string;
  nextClose: string;
  dueDate: string | null;
  /** Owed on the last statement, less payments made since. Never negative. */
  payable: number;
  /** Everything owed right now (natural sign: positive = you owe). */
  outstanding: number;
}

/**
 * @param owedAtClose        card balance (owed, natural sign) at the end of lastClose
 * @param paymentsSinceClose total paid to the card after lastClose (positive)
 * @param owedNow            card balance owed today
 */
export function cardStatus(
  today: string,
  statementDay: number,
  paymentDay: number | null,
  owedAtClose: number,
  paymentsSinceClose: number,
  owedNow: number
): CardStatus {
  const lastClose = lastStatementClose(today, statementDay);
  return {
    lastClose,
    nextClose: nextStatementClose(today, statementDay),
    dueDate: paymentDay ? paymentDueAfter(lastClose, paymentDay) : null,
    payable: Math.max(0, owedAtClose - paymentsSinceClose),
    outstanding: owedNow,
  };
}
