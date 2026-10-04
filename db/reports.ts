import { impliedRate } from '../domain/money';
import {
  balanceSheet,
  profitAndLoss,
  runningLedger,
  totalsMap,
  trialBalance,
  type LedgerLineIn,
  type TotalsMap,
} from '../domain/reports';
import { dayBefore, previousPeriod, startOfYearISO } from '../domain/dates';
import type { Account, AccountTotals } from '../domain/types';
import type { Db, Param } from './client';
import { getAccount, listAccounts } from './accounts';
import { getSettings } from './settings';

/** Per-account totals for posted transactions within [from, to] (either bound optional). */
export function accountTotals(db: Db, range: { from?: string; to?: string } = {}): TotalsMap {
  const where = [`t.status = 'posted'`];
  const params: Param[] = [];
  if (range.from) {
    where.push('t.date >= ?');
    params.push(range.from);
  }
  if (range.to) {
    where.push('t.date <= ?');
    params.push(range.to);
  }
  const rows = db.getAllSync<AccountTotals>(
    `SELECT e.account_id,
            SUM(e.debit) AS debit,
            SUM(e.credit) AS credit,
            SUM(CASE WHEN e.debit > 0 THEN e.fx_amount ELSE -e.fx_amount END) AS native
     FROM entries e JOIN transactions t ON t.id = e.transaction_id
     WHERE ${where.join(' AND ')}
     GROUP BY e.account_id`,
    params
  );
  return totalsMap(rows);
}

export function getBalanceSheet(db: Db, asOf: string) {
  const accounts = listAccounts(db);
  const toDate = accountTotals(db, { to: asOf });
  const prior = accountTotals(db, { to: dayBefore(startOfYearISO(asOf)) });
  return balanceSheet(asOf, accounts, toDate, prior);
}

export function getProfitAndLoss(db: Db, from: string, to: string, compare: boolean) {
  const accounts = listAccounts(db);
  const period = accountTotals(db, { from, to });
  const prev = compare ? accountTotals(db, previousPeriod(from, to)) : undefined;
  return profitAndLoss(from, to, accounts, period, prev);
}

export function getTrialBalance(db: Db, asOf: string) {
  return trialBalance(asOf, listAccounts(db), accountTotals(db, { to: asOf }));
}

export interface AccountLedger {
  account: Account;
  from: string;
  to: string;
  openingBase: number;
  openingNative: number;
  lines: ReturnType<typeof runningLedger>;
  closingBase: number;
  closingNative: number;
  totalDebit: number;
  totalCredit: number;
}

export function getAccountLedger(db: Db, accountId: number, from: string, to: string): AccountLedger | null {
  const account = getAccount(db, accountId);
  if (!account) return null;
  const debitNormal = account.type === 'asset' || account.type === 'expense';
  const opening = db.getFirstSync<{ base: number | null; native: number | null }>(
    `SELECT SUM(e.debit - e.credit) AS base,
            SUM(CASE WHEN e.debit > 0 THEN e.fx_amount ELSE -e.fx_amount END) AS native
     FROM entries e JOIN transactions t ON t.id = e.transaction_id
     WHERE e.account_id = ? AND t.status = 'posted' AND t.date < ?`,
    [accountId, from]
  );
  const sign = debitNormal ? 1 : -1;
  const openingBase = sign * (opening?.base ?? 0);
  const openingNative = sign * (opening?.native ?? 0);
  const rows = db.getAllSync<LedgerLineIn>(
    `SELECT e.id AS entry_id, t.id AS transaction_id, t.date, t.reference, t.description, p.name AS payee_name,
            e.memo, e.debit, e.credit, e.fx_amount, e.cleared
     FROM entries e
     JOIN transactions t ON t.id = e.transaction_id
     LEFT JOIN payees p ON p.id = t.payee_id
     WHERE e.account_id = ? AND t.status = 'posted' AND t.date BETWEEN ? AND ?
     ORDER BY t.date, t.id, e.line_no`,
    [accountId, from, to]
  );
  const lines = runningLedger(account, openingBase, openingNative, rows);
  const last = lines[lines.length - 1];
  return {
    account,
    from,
    to,
    openingBase,
    openingNative,
    lines,
    closingBase: last ? last.balance : openingBase,
    closingNative: last ? last.nativeBalance : openingNative,
    totalDebit: rows.reduce((s, r) => s + r.debit, 0),
    totalCredit: rows.reduce((s, r) => s + r.credit, 0),
  };
}

/**
 * Average book rate of a foreign-currency account (base per unit) as of a date —
 * the default rate for money leaving it, so selling at a different rate shows a realised FX gain/loss.
 */
export function bookRate(db: Db, accountId: number, asOf: string): string | null {
  const account = getAccount(db, accountId);
  if (!account) return null;
  const t = accountTotals(db, { to: asOf }).get(accountId);
  if (!t || t.native === 0) return null;
  const base = t.debit - t.credit;
  if (Math.sign(base) !== Math.sign(t.native)) return null;
  return impliedRate(Math.abs(t.native), account.currency, Math.abs(base), getSettings(db).baseCurrency);
}

export interface MonthTotals {
  month: string; // YYYY-MM
  income: number;
  expense: number;
}

export function monthlyIncomeExpense(db: Db, from: string, to: string): MonthTotals[] {
  return db.getAllSync<MonthTotals>(
    `SELECT substr(t.date, 1, 7) AS month,
            SUM(CASE WHEN a.type = 'income' THEN e.credit - e.debit ELSE 0 END) AS income,
            SUM(CASE WHEN a.type = 'expense' THEN e.debit - e.credit ELSE 0 END) AS expense
     FROM entries e
     JOIN transactions t ON t.id = e.transaction_id
     JOIN accounts a ON a.id = e.account_id
     WHERE t.status = 'posted' AND t.date BETWEEN ? AND ? AND a.type IN ('income','expense')
     GROUP BY month ORDER BY month`,
    [from, to]
  );
}
