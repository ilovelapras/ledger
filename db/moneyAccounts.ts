// Money Manager "Accounts": cash, bank, cards, loans… (asset/liability accounts with a group).

import { buildOpeningBalance } from '../domain/posting';
import { nativeBalanceOf } from '../domain/reports';
import { cardStatus, lastStatementClose, type CardStatus } from '../domain/card';
import type { Account } from '../domain/types';
import { LedgerError, nowStamp, type Db } from './client';
import { getAccount, requireAccountByCode } from './accounts';
import { writeAudit } from './audit';
import { nextFreeCode } from './categories';
import { accountTotals } from './reports';
import { ACCOUNT_GROUPS, groupInfo, isSystemAccount, SYSTEM_CODES, type AccountGroup } from './seed';
import { getSettings } from './settings';
import { createTransaction, getTransaction, updateTransaction, voidTransaction } from './transactions';

/** Initial balances are dated at the start of time so they apply before any transaction. */
export const INITIAL_BALANCE_DATE = '1970-01-01';
const INITIAL_BALANCE_DESC = 'Initial balance';

export function listMoneyAccounts(db: Db, includeHidden = false): Account[] {
  const rows = db
    .getAllSync<Account>(
      `SELECT * FROM accounts WHERE type IN ('asset','liability') AND is_placeholder = 0
       ${includeHidden ? '' : 'AND is_active = 1'} ORDER BY sort_order, code`,
      []
    )
    .filter((a) => !isSystemAccount(a));
  const order = (g: string | null) => {
    const i = ACCOUNT_GROUPS.findIndex((x) => x.key === g);
    return i < 0 ? ACCOUNT_GROUPS.length : i;
  };
  return rows.sort((a, b) => order(a.grp) - order(b.grp));
}

export interface MoneyAccountInput {
  name: string;
  grp: AccountGroup;
  currency: string;
  icon?: string | null;
  notes?: string | null;
  includeInTotals: boolean;
  statementDay?: number | null;
  paymentDay?: number | null;
  paymentAccountId?: number | null;
}

function checkInput(db: Db, input: MoneyAccountInput): void {
  if (!input.name.trim()) throw new LedgerError('Enter a name.');
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new LedgerError('Choose a currency.');
  for (const d of [input.statementDay, input.paymentDay]) {
    if (d != null && !(Number.isInteger(d) && d >= 1 && d <= 31)) throw new LedgerError('Days must be between 1 and 31.');
  }
  if (input.paymentAccountId != null && !getAccount(db, input.paymentAccountId))
    throw new LedgerError('Choose the account the card is paid from.');
}

export function createMoneyAccount(db: Db, input: MoneyAccountInput): number {
  checkInput(db, input);
  const g = groupInfo(input.grp);
  const isCard = input.grp === 'card';
  const maxOrder = db.getFirstSync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM accounts', [])?.m ?? 0;
  let id = 0;
  db.withTransactionSync(() => {
    id = db.runSync(
      `INSERT INTO accounts (code, name, type, subtype, currency, is_placeholder, icon, grp, sort_order, notes,
         include_in_totals, statement_day, payment_day, payment_account_id, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextFreeCode(db, g.type),
        input.name.trim(),
        g.type,
        g.subtype,
        input.currency,
        input.icon ?? g.icon,
        g.key,
        maxOrder + 1,
        input.notes?.trim() || null,
        input.includeInTotals ? 1 : 0,
        isCard ? input.statementDay ?? null : null,
        isCard ? input.paymentDay ?? null : null,
        isCard ? input.paymentAccountId ?? null : null,
        nowStamp(),
      ]
    ).lastInsertRowId;
    writeAudit(db, 'create', 'account', id, null, getAccount(db, id));
  });
  return id;
}

function hasEntries(db: Db, id: number): boolean {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE account_id = ?', [id])!.n > 0;
}

export function updateMoneyAccount(db: Db, id: number, input: MoneyAccountInput): void {
  const before = getAccount(db, id);
  if (!before) throw new LedgerError('Account not found.');
  checkInput(db, input);
  const g = groupInfo(input.grp);
  const used = hasEntries(db, id);
  if (used && g.type !== before.type)
    throw new LedgerError(`This account has transactions, so it can't move between money you have and money you owe.`);
  if (used && input.currency !== before.currency) throw new LedgerError("Currency can't change once the account has transactions.");
  const isCard = input.grp === 'card';
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE accounts SET name = ?, type = ?, subtype = ?, currency = ?, icon = ?, grp = ?, notes = ?, include_in_totals = ?,
         statement_day = ?, payment_day = ?, payment_account_id = ? WHERE id = ?`,
      [
        input.name.trim(),
        g.type,
        g.subtype,
        input.currency,
        input.icon ?? before.icon ?? g.icon,
        g.key,
        input.notes?.trim() || null,
        input.includeInTotals ? 1 : 0,
        isCard ? input.statementDay ?? null : null,
        isCard ? input.paymentDay ?? null : null,
        isCard ? input.paymentAccountId ?? null : null,
        id,
      ]
    );
    writeAudit(db, 'update', 'account', id, before, getAccount(db, id));
  });
}

/** Hide (keeps history) or delete (only if never used). */
export function removeMoneyAccount(db: Db, id: number): 'deleted' | 'hidden' {
  const a = getAccount(db, id);
  if (!a) return 'deleted';
  // An account whose only activity is its initial balance can still be deleted.
  const real = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM entries e JOIN transactions t ON t.id = e.transaction_id
     WHERE e.account_id = ? AND NOT (t.kind = 'opening' AND t.description = ?)`,
    [id, INITIAL_BALANCE_DESC]
  )!.n;
  if (real > 0) {
    db.runSync('UPDATE accounts SET is_active = 0 WHERE id = ?', [id]);
    return 'hidden';
  }
  db.withTransactionSync(() => {
    const opening = db.getAllSync<{ id: number }>(
      `SELECT DISTINCT t.id FROM transactions t JOIN entries e ON e.transaction_id = t.id
       WHERE e.account_id = ? AND t.kind = 'opening' AND t.description = ?`,
      [id, INITIAL_BALANCE_DESC]
    );
    for (const t of opening) db.runSync('DELETE FROM transactions WHERE id = ?', [t.id]);
    db.runSync('UPDATE accounts SET payment_account_id = NULL WHERE payment_account_id = ?', [id]);
    db.runSync('DELETE FROM accounts WHERE id = ?', [id]);
    writeAudit(db, 'delete', 'account', id, a, null);
  });
  return 'deleted';
}

/** Current initial balance (natural sign, account currency). */
export function getInitialBalance(db: Db, accountId: number): { amount: number; rate: string | null } {
  const a = getAccount(db, accountId);
  if (!a) return { amount: 0, rate: null };
  const row = db.getFirstSync<{ v: number | null; rate: string | null }>(
    `SELECT SUM(CASE WHEN e.debit > 0 THEN e.fx_amount ELSE -e.fx_amount END) AS v, MAX(e.fx_rate) AS rate
     FROM entries e JOIN transactions t ON t.id = e.transaction_id
     WHERE e.account_id = ? AND t.kind = 'opening' AND t.status = 'posted'`,
    [accountId]
  );
  const sign = a.type === 'asset' ? 1 : -1;
  return { amount: sign * (row?.v ?? 0), rate: row?.rate ?? null };
}

/**
 * Set the starting balance (what the account held / owed before the first transaction).
 * Posted against Opening Balance Equity, so it never shows up as income or expense.
 */
export function setInitialBalance(db: Db, accountId: number, amount: number, rate?: string): void {
  const a = getAccount(db, accountId);
  if (!a) throw new LedgerError('Account not found.');
  const base = getSettings(db).baseCurrency;
  const existing = db.getFirstSync<{ id: number }>(
    `SELECT t.id FROM transactions t JOIN entries e ON e.transaction_id = t.id
     WHERE e.account_id = ? AND t.kind = 'opening' AND t.status = 'posted' AND t.description = ? LIMIT 1`,
    [accountId, INITIAL_BALANCE_DESC]
  );
  const current = getInitialBalance(db, accountId).amount;
  const dedicated = existing
    ? (() => {
        const tx = getTransaction(db, existing.id)!;
        const line = tx.entries.find((e) => e.account_id === accountId)!;
        return (a.type === 'asset') === line.debit > 0 ? line.fx_amount : -line.fx_amount;
      })()
    : 0;
  const target = amount - (current - dedicated); // other opening entries (e.g. older opening screen) stay as they are
  if (existing && target === 0) {
    voidTransaction(db, existing.id, 'Initial balance cleared');
    return;
  }
  if (target === 0) return;
  if (a.currency !== base && !rate) throw new LedgerError(`Enter the ${a.currency} → ${base} rate for the initial balance.`);
  const entries = buildOpeningBalance({
    baseCurrency: base,
    account: a,
    amount: target,
    rate,
    openingEquity: requireAccountByCode(db, SYSTEM_CODES.openingEquity),
  });
  const input = { date: INITIAL_BALANCE_DATE, kind: 'opening' as const, description: INITIAL_BALANCE_DESC, entries };
  if (existing) updateTransaction(db, existing.id, input);
  else createTransaction(db, input);
}

export interface MoneyAccountBalance {
  account: Account;
  /** Natural sign in the account's currency: positive = you have it (assets) / you owe it (liabilities). */
  native: number;
  /** Same in base currency. */
  base: number;
}

export function moneyAccountBalances(db: Db, asOf: string, includeHidden = false): MoneyAccountBalance[] {
  const totals = accountTotals(db, { to: asOf });
  return listMoneyAccounts(db, includeHidden).map((account) => {
    const t = totals.get(account.id);
    const debitMinusCredit = t ? t.debit - t.credit : 0;
    return {
      account,
      native: nativeBalanceOf(account, totals),
      base: account.type === 'asset' ? debitMinusCredit : -debitMinusCredit,
    };
  });
}

/** Statement position of a credit card (amounts in the card's currency). */
export function getCardStatus(db: Db, accountId: number, today: string): CardStatus | null {
  const a = getAccount(db, accountId);
  if (!a || a.grp !== 'card' || !a.statement_day) return null;
  const close = lastStatementClose(today, a.statement_day);
  const owed = (to: string) => nativeBalanceOf(a, accountTotals(db, { to }));
  const paid =
    db.getFirstSync<{ v: number | null }>(
      `SELECT SUM(e.fx_amount) AS v FROM entries e JOIN transactions t ON t.id = e.transaction_id
       WHERE e.account_id = ? AND e.debit > 0 AND t.status = 'posted' AND t.date > ? AND t.date <= ?`,
      [accountId, close, today]
    )?.v ?? 0;
  return cardStatus(today, a.statement_day, a.payment_day, owed(close), paid, owed(today));
}
