import { parseMoney } from '../domain/money';
import { buildReversal, validateEntries } from '../domain/posting';
import type { Account, Entry, EntryInput, Transaction, TransactionInput, TxKind, TxStatus } from '../domain/types';
import { LedgerError, nowStamp, type Db, type Param } from './client';
import { writeAudit } from './audit';
import { setPayeeDefaultAccount } from './payees';
import { consumeReference, getSettings } from './settings';

export interface EntryWithAccount extends Entry {
  account_code: string;
  account_name: string;
  account_type: Account['type'];
}

export interface TransactionDetail extends Transaction {
  payee_name: string | null;
  entries: EntryWithAccount[];
}

export interface TransactionSummary extends Transaction {
  payee_name: string | null;
  /** Total debits (= total credits), base units. */
  amount: number;
  /** Comma-separated account names, debit lines first. */
  accounts: string;
}

export interface TransactionFilters {
  search?: string;
  from?: string;
  to?: string;
  accountId?: number | null;
  kind?: TxKind | null;
  status?: TxStatus | 'all';
  limit?: number;
  offset?: number;
}

export function getTransaction(db: Db, id: number): TransactionDetail | null {
  const tx = db.getFirstSync<Transaction & { payee_name: string | null }>(
    `SELECT t.*, p.name AS payee_name FROM transactions t LEFT JOIN payees p ON p.id = t.payee_id WHERE t.id = ?`,
    [id]
  );
  if (!tx) return null;
  const entries = db.getAllSync<EntryWithAccount>(
    `SELECT e.*, a.code AS account_code, a.name AS account_name, a.type AS account_type
     FROM entries e JOIN accounts a ON a.id = e.account_id
     WHERE e.transaction_id = ? ORDER BY e.line_no`,
    [id]
  );
  return { ...tx, entries };
}

export function listTransactions(db: Db, f: TransactionFilters = {}): TransactionSummary[] {
  const where: string[] = [];
  const params: Param[] = [];
  const status = f.status ?? 'posted';
  if (status !== 'all') {
    where.push('t.status = ?');
    params.push(status);
  }
  if (f.from) {
    where.push('t.date >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('t.date <= ?');
    params.push(f.to);
  }
  if (f.kind) {
    where.push('t.kind = ?');
    params.push(f.kind);
  }
  if (f.accountId) {
    where.push('EXISTS (SELECT 1 FROM entries x WHERE x.transaction_id = t.id AND x.account_id = ?)');
    params.push(f.accountId);
  }
  const search = f.search?.trim();
  if (search) {
    const like = `%${search.replace(/[%_]/g, '')}%`;
    const clauses = ['t.description LIKE ?', 't.reference LIKE ?', 't.memo LIKE ?', 'p.name LIKE ?'];
    params.push(like, like, like, like);
    const amount = /^[\d,]*\.?\d+$/.test(search) ? parseMoney(search, getSettings(db).baseCurrency) : null;
    if (amount != null) {
      // Amount search matches the transaction total in base units.
      clauses.push('(SELECT SUM(debit) FROM entries y WHERE y.transaction_id = t.id) = ?');
      params.push(amount);
    }
    clauses.push('EXISTS (SELECT 1 FROM entries z JOIN accounts za ON za.id = z.account_id WHERE z.transaction_id = t.id AND (za.name LIKE ? OR z.memo LIKE ?))');
    params.push(like, like);
    where.push(`(${clauses.join(' OR ')})`);
  }
  params.push(f.limit ?? 200, f.offset ?? 0);
  return db.getAllSync<TransactionSummary>(
    `SELECT t.*, p.name AS payee_name,
       (SELECT SUM(e.debit) FROM entries e WHERE e.transaction_id = t.id) AS amount,
       (SELECT GROUP_CONCAT(name, ', ') FROM (
          SELECT a.name AS name FROM entries e JOIN accounts a ON a.id = e.account_id
          WHERE e.transaction_id = t.id ORDER BY e.debit = 0, e.line_no)) AS accounts
     FROM transactions t LEFT JOIN payees p ON p.id = t.payee_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY t.date DESC, t.id DESC
     LIMIT ? OFFSET ?`,
    params
  );
}

function assertUnlocked(db: Db, date: string): void {
  const { lockDate } = getSettings(db);
  if (lockDate && date <= lockDate)
    throw new LedgerError(`The books are locked up to ${lockDate}. Change the lock date in Settings to post here.`);
}

function assertValid(db: Db, input: TransactionInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new LedgerError('Enter a valid date.');
  const err = validateEntries(input.entries);
  if (err) throw new LedgerError(err);
  for (const e of input.entries) {
    const a = db.getFirstSync<Account>('SELECT * FROM accounts WHERE id = ?', [e.account_id]);
    if (!a) throw new LedgerError('An account on this transaction no longer exists.');
    if (a.is_placeholder) throw new LedgerError(`"${a.name}" is a header account. Choose one of its sub-accounts.`);
    if (!a.is_active) throw new LedgerError(`"${a.name}" is inactive.`);
    if (a.currency !== e.currency) throw new LedgerError(`"${a.name}" is held in ${a.currency}, not ${e.currency}.`);
  }
  assertUnlocked(db, input.date);
}

function insertEntries(db: Db, txId: number, entries: EntryInput[]): void {
  entries.forEach((e, i) => {
    db.runSync(
      `INSERT INTO entries (transaction_id, line_no, account_id, debit, credit, currency, fx_amount, fx_rate, memo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [txId, i + 1, e.account_id, e.debit, e.credit, e.currency, e.fx_amount, e.fx_rate, e.memo?.trim() || null]
    );
  });
}

/** Remember the category used with a payee so the next entry can prefill it. */
function learnPayee(db: Db, input: TransactionInput): void {
  if (!input.payee_id || (input.kind !== 'payment' && input.kind !== 'receipt')) return;
  const category = input.entries[1];
  if (category) setPayeeDefaultAccount(db, input.payee_id, category.account_id);
}

export function createTransaction(db: Db, input: TransactionInput, opts: { reversesId?: number } = {}): number {
  assertValid(db, input);
  let id = 0;
  db.withTransactionSync(() => {
    const now = nowStamp();
    const reference = input.reference?.trim() || consumeReference(db, input.kind);
    id = db.runSync(
      `INSERT INTO transactions (date, time, kind, reference, payee_id, description, memo, status, reverses_id,
         recurrence_id, installment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?)`,
      [
        input.date,
        input.time || null,
        input.kind,
        reference,
        input.payee_id ?? null,
        input.description.trim(),
        input.memo?.trim() || null,
        opts.reversesId ?? null,
        input.recurrence_id ?? null,
        input.installment ?? null,
        now,
        now,
      ]
    ).lastInsertRowId;
    insertEntries(db, id, input.entries);
    learnPayee(db, input);
    writeAudit(db, 'create', 'transaction', id, null, getTransaction(db, id));
  });
  return id;
}

function assertEditable(db: Db, tx: TransactionDetail): void {
  if (tx.status === 'void') throw new LedgerError('This transaction is void.');
  if (tx.entries.some((e) => e.cleared === 'reconciled'))
    throw new LedgerError('This transaction is part of a completed reconciliation and cannot be changed.');
  assertUnlocked(db, tx.date);
}

export function updateTransaction(db: Db, id: number, input: TransactionInput): void {
  const before = getTransaction(db, id);
  if (!before) throw new LedgerError('Transaction not found.');
  assertEditable(db, before);
  assertValid(db, input);
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE transactions SET date = ?, time = ?, reference = ?, payee_id = ?, description = ?, memo = ?, updated_at = ? WHERE id = ?`,
      [
        input.date,
        input.time || null,
        input.reference?.trim() || before.reference,
        input.payee_id ?? null,
        input.description.trim(),
        input.memo?.trim() || null,
        nowStamp(),
        id,
      ]
    );
    db.runSync('DELETE FROM entries WHERE transaction_id = ?', [id]);
    insertEntries(db, id, input.entries);
    learnPayee(db, input);
    writeAudit(db, 'update', 'transaction', id, before, getTransaction(db, id));
  });
}

/** Void keeps the record for the audit trail but removes it from all balances. */
export function voidTransaction(db: Db, id: number, reason: string): void {
  const before = getTransaction(db, id);
  if (!before) throw new LedgerError('Transaction not found.');
  assertEditable(db, before);
  if (!reason.trim()) throw new LedgerError('Give a reason for voiding.');
  db.withTransactionSync(() => {
    db.runSync(`UPDATE transactions SET status = 'void', void_reason = ?, updated_at = ? WHERE id = ?`, [
      reason.trim(),
      nowStamp(),
      id,
    ]);
    db.runSync(`UPDATE entries SET cleared = 'uncleared' WHERE transaction_id = ?`, [id]);
    writeAudit(db, 'void', 'transaction', id, before, getTransaction(db, id));
  });
}

/** Post a mirror-image entry on `date`, leaving the original untouched (use when the original period is locked). */
export function reverseTransaction(db: Db, id: number, date: string): number {
  const original = getTransaction(db, id);
  if (!original) throw new LedgerError('Transaction not found.');
  if (original.status === 'void') throw new LedgerError('A void transaction cannot be reversed.');
  const already = db.getFirstSync<{ id: number }>(
    `SELECT id FROM transactions WHERE reverses_id = ? AND status = 'posted'`,
    [id]
  );
  if (already) throw new LedgerError('This transaction has already been reversed.');
  const newId = createTransaction(
    db,
    {
      date,
      kind: 'reversal',
      payee_id: original.payee_id,
      description: `Reversal of ${original.reference}${original.description ? ' – ' + original.description : ''}`,
      memo: null,
      entries: buildReversal(original.entries),
    },
    { reversesId: id }
  );
  writeAudit(db, 'reverse', 'transaction', id, null, { reversed_by: newId });
  return newId;
}

/** Transactions that reverse the given one (normally zero or one). */
export function getReversals(db: Db, id: number): Transaction[] {
  return db.getAllSync<Transaction>('SELECT * FROM transactions WHERE reverses_id = ?', [id]);
}

/** Convert a stored transaction back to the input shape (for edit/duplicate). */
export function toInput(tx: TransactionDetail): TransactionInput {
  return {
    date: tx.date,
    time: tx.time,
    kind: tx.kind,
    reference: tx.reference,
    payee_id: tx.payee_id,
    description: tx.description,
    memo: tx.memo,
    entries: tx.entries.map((e) => ({
      account_id: e.account_id,
      debit: e.debit,
      credit: e.credit,
      currency: e.currency,
      fx_amount: e.fx_amount,
      fx_rate: e.fx_rate,
      memo: e.memo,
    })),
  };
}
