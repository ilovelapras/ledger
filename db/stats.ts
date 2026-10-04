// Read models for the Money Manager screens. Income/expense figures come from posted entries on
// income/expense accounts, so they always agree with the Profit & Loss.

import type { TxKind } from '../domain/types';
import type { Db, Param } from './client';

export interface DayTotals {
  date: string;
  income: number;
  expense: number;
}

/** Income and expense per day (base currency) for days with activity. */
export function dailyTotals(db: Db, from: string, to: string): DayTotals[] {
  return db.getAllSync<DayTotals>(
    `SELECT t.date AS date,
            SUM(CASE WHEN a.type = 'income' THEN e.credit - e.debit ELSE 0 END) AS income,
            SUM(CASE WHEN a.type = 'expense' THEN e.debit - e.credit ELSE 0 END) AS expense
     FROM entries e
     JOIN transactions t ON t.id = e.transaction_id
     JOIN accounts a ON a.id = e.account_id
     WHERE t.status = 'posted' AND a.type IN ('income','expense') AND t.date BETWEEN ? AND ?
     GROUP BY t.date ORDER BY t.date`,
    [from, to]
  );
}

export function sumTotals(days: DayTotals[], from: string, to: string): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const d of days) {
    if (d.date < from || d.date > to) continue;
    income += d.income;
    expense += d.expense;
  }
  return { income, expense };
}

export interface CategoryTotal {
  id: number;
  name: string;
  icon: string | null;
  amount: number;
}

/**
 * Totals per main category (subcategories rolled up), or per subcategory of `parentId`.
 * Natural sign: positive = spent (expense) / earned (income).
 */
export function categoryTotals(
  db: Db,
  type: 'income' | 'expense',
  from: string,
  to: string,
  parentId?: number
): CategoryTotal[] {
  const sign = type === 'expense' ? 'e.debit - e.credit' : 'e.credit - e.debit';
  const params: Param[] = [type, from, to];
  const groupCol = parentId == null ? 'COALESCE(a.parent_id, a.id)' : 'a.id';
  let filter = '';
  if (parentId != null) {
    filter = 'AND (a.parent_id = ? OR a.id = ?)';
    params.push(parentId, parentId);
  }
  return db.getAllSync<CategoryTotal>(
    `SELECT c.id, c.name, c.icon, x.amount FROM (
       SELECT ${groupCol} AS cid, SUM(${sign}) AS amount
       FROM entries e
       JOIN transactions t ON t.id = e.transaction_id
       JOIN accounts a ON a.id = e.account_id
       WHERE a.type = ? AND t.status = 'posted' AND t.date BETWEEN ? AND ? ${filter}
       GROUP BY cid
     ) x JOIN accounts c ON c.id = x.cid
     WHERE x.amount <> 0
     ORDER BY x.amount DESC`,
    params
  );
}

export interface NoteTotal {
  note: string;
  amount: number;
  count: number;
}

/** Money Manager "Note" tab: totals grouped by the note text. */
export function noteTotals(db: Db, type: 'income' | 'expense', from: string, to: string): NoteTotal[] {
  const sign = type === 'expense' ? 'e.debit - e.credit' : 'e.credit - e.debit';
  return db.getAllSync<NoteTotal>(
    `SELECT COALESCE(NULLIF(TRIM(t.description), ''), '(no note)') AS note,
            SUM(${sign}) AS amount, COUNT(DISTINCT t.id) AS count
     FROM entries e
     JOIN transactions t ON t.id = e.transaction_id
     JOIN accounts a ON a.id = e.account_id
     WHERE a.type = ? AND t.status = 'posted' AND t.date BETWEEN ? AND ?
     GROUP BY note HAVING amount <> 0 ORDER BY amount DESC`,
    [type, from, to]
  );
}

export interface TxRow {
  id: number;
  date: string;
  time: string | null;
  kind: TxKind;
  description: string;
  memo: string | null;
  installment: string | null;
  recurrence_id: number | null;
  /** Account money moved from (expense, transfer) or into (income). */
  account_id: number;
  account_name: string;
  account_currency: string;
  /** Amount in that account's currency. */
  native_amount: number;
  /** Base-currency amount. */
  amount: number;
  /** Category (income/expense) or destination account (transfer). */
  category_id: number | null;
  category_name: string | null;
  category_icon: string | null;
  parent_category_name: string | null;
  line_count: number;
  photo_count: number;
}

export interface TxFilter {
  from: string;
  to: string;
  /** Only transactions touching this account. */
  accountId?: number;
  /** Only transactions in this category (or its subcategories). */
  categoryId?: number;
  search?: string;
}

/** Transactions for the Money Manager lists (opening balances and deleted items excluded). */
export function listTxRows(db: Db, f: TxFilter): TxRow[] {
  const where = [`t.status = 'posted'`, `t.kind <> 'opening'`, 't.date BETWEEN ? AND ?'];
  const params: Param[] = [f.from, f.to];
  if (f.accountId != null) {
    where.push('EXISTS (SELECT 1 FROM entries x WHERE x.transaction_id = t.id AND x.account_id = ?)');
    params.push(f.accountId);
  }
  if (f.categoryId != null) {
    where.push(
      `EXISTS (SELECT 1 FROM entries x JOIN accounts xa ON xa.id = x.account_id
               WHERE x.transaction_id = t.id AND (xa.id = ? OR xa.parent_id = ?))`
    );
    params.push(f.categoryId, f.categoryId);
  }
  const q = f.search?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    where.push(`(t.description LIKE ? OR t.memo LIKE ? OR ma.name LIKE ? OR ca.name LIKE ? OR pa.name LIKE ?)`);
    params.push(like, like, like, like, like);
  }
  return db.getAllSync<TxRow>(
    `SELECT t.id, t.date, t.time, t.kind, t.description, t.memo, t.installment, t.recurrence_id,
            m.account_id, ma.name AS account_name, ma.currency AS account_currency,
            m.fx_amount AS native_amount, m.debit + m.credit AS amount,
            c.account_id AS category_id, ca.name AS category_name, ca.icon AS category_icon,
            pa.name AS parent_category_name,
            (SELECT COUNT(*) FROM entries y WHERE y.transaction_id = t.id) AS line_count,
            (SELECT COUNT(*) FROM attachments z WHERE z.transaction_id = t.id) AS photo_count
     FROM transactions t
     JOIN entries m ON m.transaction_id = t.id AND m.line_no = CASE WHEN t.kind = 'transfer' THEN 2 ELSE 1 END
     JOIN accounts ma ON ma.id = m.account_id
     LEFT JOIN entries c ON c.transaction_id = t.id AND c.line_no = CASE WHEN t.kind = 'transfer' THEN 1 ELSE 2 END
     LEFT JOIN accounts ca ON ca.id = c.account_id
     LEFT JOIN accounts pa ON pa.id = ca.parent_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.date DESC, COALESCE(t.time, '') DESC, t.id DESC`,
    params
  );
}

/** Spending per money account in a period (Summary tab). */
export function spendingByAccount(db: Db, from: string, to: string): { id: number; name: string; amount: number }[] {
  return db.getAllSync(
    `SELECT ma.id, ma.name, SUM(m.debit + m.credit) AS amount
     FROM transactions t
     JOIN entries m ON m.transaction_id = t.id AND m.line_no = 1
     JOIN accounts ma ON ma.id = m.account_id
     WHERE t.status = 'posted' AND t.kind = 'payment' AND t.date BETWEEN ? AND ?
     GROUP BY ma.id ORDER BY amount DESC`,
    [from, to]
  );
}
