import { budgetSummary, type BudgetSummary } from '../domain/budget';
import { LedgerError, type Db } from './client';
import { listCategories } from './categories';
import { categoryTotals } from './stats';

export interface BudgetRow {
  account_id: number;
  month: string;
  amount: number;
}

/** Budget for a category in a month: that month's override, else the every-month default. */
export function budgetFor(db: Db, accountId: number, month: string): number {
  const row = db.getFirstSync<{ amount: number }>(
    `SELECT amount FROM budgets WHERE account_id = ? AND month IN (?, '') ORDER BY month DESC LIMIT 1`,
    [accountId, month]
  );
  return row?.amount ?? 0;
}

/** month = 'YYYY-MM' for one month only, '' for every month. amount 0 removes it. */
export function setBudget(db: Db, accountId: number, month: string, amount: number): void {
  if (month !== '' && !/^\d{4}-\d{2}$/.test(month)) throw new LedgerError('Invalid month.');
  if (!Number.isSafeInteger(amount) || amount < 0) throw new LedgerError('Enter a valid amount.');
  if (amount === 0 && month === '') {
    db.runSync(`DELETE FROM budgets WHERE account_id = ? AND month = ''`, [accountId]);
    return;
  }
  db.runSync(
    `INSERT INTO budgets (account_id, month, amount) VALUES (?, ?, ?)
     ON CONFLICT(account_id, month) DO UPDATE SET amount = excluded.amount`,
    [accountId, month, amount]
  );
}

export function clearMonthOverride(db: Db, accountId: number, month: string): void {
  db.runSync('DELETE FROM budgets WHERE account_id = ? AND month = ?', [accountId, month]);
}

export function listBudgets(db: Db): BudgetRow[] {
  return db.getAllSync<BudgetRow>('SELECT account_id, month, amount FROM budgets', []);
}

/**
 * Budget vs spending for a period. `budgetMonth` (YYYY-MM) picks which month's budgets apply —
 * the month the period is named after.
 */
export function getBudgetSummary(db: Db, from: string, to: string, budgetMonth: string): BudgetSummary {
  const cats = listCategories(db, 'expense').map((g) => g.category);
  const spent = new Map(categoryTotals(db, 'expense', from, to).map((c) => [c.id, c.amount]));
  // Spending in hidden or system categories still counts towards the total.
  const known = new Set(cats.map((c) => c.id));
  const extra = categoryTotals(db, 'expense', from, to).filter((c) => !known.has(c.id));
  return budgetSummary([...cats, ...extra], spent, (id) => budgetFor(db, id, budgetMonth));
}
