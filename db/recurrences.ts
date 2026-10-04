// Repeating transactions (Money Manager "Repeat") and instalment purchases.

import { dueOccurrences, occurrence, splitInstallments, type Freq } from '../domain/recurrence';
import { formToEntries, type TxFormValues } from '../domain/txForm';
import { parseMoney, toDecimalString } from '../domain/money';
import { LedgerError, nowStamp, type Db } from './client';
import { buildFormContext } from './formContext';
import { createTransaction } from './transactions';

export interface Recurrence {
  id: number;
  kind: 'payment' | 'receipt' | 'transfer';
  template_json: string;
  freq: Freq;
  start_date: string;
  end_date: string | null;
  posted_count: number;
  active: number;
  created_at: string;
}

type RepeatKind = Recurrence['kind'];

function asKind(mode: TxFormValues['mode']): RepeatKind {
  if (mode === 'journal') throw new LedgerError('Journals cannot repeat.');
  return mode;
}

/** Post one occurrence of a template on `date`. */
function postFromTemplate(db: Db, values: TxFormValues, date: string, extra: { recurrenceId?: number; installment?: string } = {}): number {
  const v = { ...values, date };
  const entries = formToEntries(v, buildFormContext(db));
  return createTransaction(db, {
    date,
    time: null,
    kind: asKind(v.mode),
    description: v.description,
    memo: v.memo,
    entries,
    recurrence_id: extra.recurrenceId ?? null,
    installment: extra.installment ?? null,
  });
}

/**
 * Save a transaction that repeats: posts the first occurrence now (even if future-dated, like Money Manager)
 * and later occurrences as they fall due. Returns the first transaction's id.
 */
export function createRepeating(db: Db, values: TxFormValues, freq: Freq, endDate: string | null): number {
  if (endDate && endDate < values.date) throw new LedgerError('The end date is before the first date.');
  const kind = asKind(values.mode);
  formToEntries(values, buildFormContext(db)); // validate before saving the schedule
  const { date: _date, reference: _ref, ...template } = values;
  const recId = db.runSync(
    `INSERT INTO recurrences (kind, template_json, freq, start_date, end_date, posted_count, active, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
    [kind, JSON.stringify(template), freq, values.date, endDate, nowStamp()]
  ).lastInsertRowId;
  let id: number;
  try {
    id = postFromTemplate(db, values, values.date, { recurrenceId: recId });
  } catch (e) {
    db.runSync('DELETE FROM recurrences WHERE id = ?', [recId]);
    throw e;
  }
  db.runSync('UPDATE recurrences SET posted_count = 1 WHERE id = ?', [recId]);
  return id;
}

/** Catch up every active schedule to `today`. Safe to call on each launch. Returns how many were posted. */
export function postDueRecurrences(db: Db, today: string): number {
  let posted = 0;
  const rows = db.getAllSync<Recurrence>('SELECT * FROM recurrences WHERE active = 1', []);
  for (const r of rows) {
    const template = JSON.parse(r.template_json) as Omit<TxFormValues, 'date' | 'reference'>;
    for (const { index, date } of dueOccurrences(r.start_date, r.freq, r.posted_count, today, r.end_date)) {
      try {
        postFromTemplate(db, { ...template, date, reference: '' }, date, { recurrenceId: r.id });
      } catch {
        // An account was deleted or hidden: stop the schedule rather than fail every launch.
        db.runSync('UPDATE recurrences SET active = 0 WHERE id = ?', [r.id]);
        break;
      }
      db.runSync('UPDATE recurrences SET posted_count = ? WHERE id = ?', [index + 1, r.id]);
      posted++;
    }
    const next = occurrence(r.start_date, r.freq, db.getFirstSync<{ c: number }>('SELECT posted_count AS c FROM recurrences WHERE id = ?', [r.id])!.c);
    if (r.end_date && next > r.end_date) db.runSync('UPDATE recurrences SET active = 0 WHERE id = ?', [r.id]);
  }
  return posted;
}

export interface RecurrenceRow extends Recurrence {
  description: string;
  next_date: string | null;
  amount: string;
}

export function listRecurrences(db: Db): RecurrenceRow[] {
  return db.getAllSync<Recurrence>('SELECT * FROM recurrences ORDER BY active DESC, id DESC', []).map((r) => {
    const t = JSON.parse(r.template_json) as Partial<TxFormValues>;
    const next = occurrence(r.start_date, r.freq, r.posted_count);
    return {
      ...r,
      description: t.description || '',
      amount: t.mode === 'transfer' ? t.sent ?? '' : t.lines?.[0]?.amount ?? '',
      next_date: r.active && (!r.end_date || next <= r.end_date) ? next : null,
    };
  });
}

export function stopRecurrence(db: Db, id: number): void {
  db.runSync('UPDATE recurrences SET active = 0 WHERE id = ?', [id]);
}

/** Delete the schedule; already-posted transactions stay. */
export function deleteRecurrence(db: Db, id: number): void {
  db.withTransactionSync(() => {
    db.runSync('UPDATE transactions SET recurrence_id = NULL WHERE recurrence_id = ?', [id]);
    db.runSync('DELETE FROM recurrences WHERE id = ?', [id]);
  });
}

/**
 * Card instalments: split an expense into `months` monthly payments starting on the entry date,
 * each marked "k/N". Returns the first transaction's id.
 */
export function createInstallments(db: Db, values: TxFormValues, months: number): number {
  if (values.mode !== 'payment') throw new LedgerError('Only expenses can be paid in instalments.');
  if (values.lines.length !== 1) throw new LedgerError('Instalments need a single category.');
  const ctx = buildFormContext(db);
  const money = values.moneyAccountId != null ? ctx.accounts.get(values.moneyAccountId) : undefined;
  if (!money) throw new LedgerError('Choose the account paid from.');
  const total = parseMoney(values.lines[0].amount, money.currency);
  if (total == null || total <= 0) throw new LedgerError('Enter the amount.');
  formToEntries(values, ctx); // validate
  const parts = splitInstallments(total, months);
  let first = 0;
  parts.forEach((part, i) => {
    const v: TxFormValues = {
      ...values,
      lines: [{ ...values.lines[0], amount: toDecimalString(part, money.currency) }],
    };
    const id = postFromTemplate(db, v, occurrence(values.date, 'monthly', i), { installment: `${i + 1}/${months}` });
    if (i === 0) first = id;
  });
  return first;
}
