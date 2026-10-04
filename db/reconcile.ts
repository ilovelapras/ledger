import type { ClearedStatus, Reconciliation } from '../domain/types';
import { LedgerError, nowStamp, type Db } from './client';
import { getAccount } from './accounts';
import { writeAudit } from './audit';

export interface ReconcileLine {
  entry_id: number;
  transaction_id: number;
  date: string;
  reference: string;
  description: string;
  payee_name: string | null;
  /** Natural-sign amount in the account's currency. */
  amount: number;
  cleared: ClearedStatus;
}

function sign(type: string): number {
  return type === 'asset' || type === 'expense' ? 1 : -1;
}

export function lastReconciliation(db: Db, accountId: number): Reconciliation | null {
  return db.getFirstSync<Reconciliation>(
    'SELECT * FROM reconciliations WHERE account_id = ? ORDER BY statement_date DESC, id DESC LIMIT 1',
    [accountId]
  );
}

export function listReconciliations(db: Db, accountId: number): Reconciliation[] {
  return db.getAllSync<Reconciliation>(
    'SELECT * FROM reconciliations WHERE account_id = ? ORDER BY statement_date DESC, id DESC',
    [accountId]
  );
}

/** Native-currency balance of reconciled lines (natural sign). */
export function reconciledBalance(db: Db, accountId: number): number {
  const a = getAccount(db, accountId);
  if (!a) return 0;
  const r = db.getFirstSync<{ v: number | null }>(
    `SELECT SUM(CASE WHEN e.debit > 0 THEN e.fx_amount ELSE -e.fx_amount END) AS v
     FROM entries e JOIN transactions t ON t.id = e.transaction_id
     WHERE e.account_id = ? AND t.status = 'posted' AND e.cleared = 'reconciled'`,
    [accountId]
  );
  return sign(a.type) * (r?.v ?? 0);
}

/** Unreconciled lines dated on or before the statement date. */
export function unreconciledLines(db: Db, accountId: number, statementDate: string): ReconcileLine[] {
  const a = getAccount(db, accountId);
  if (!a) return [];
  const s = sign(a.type);
  return db
    .getAllSync<Omit<ReconcileLine, 'amount'> & { signed: number }>(
      `SELECT e.id AS entry_id, t.id AS transaction_id, t.date, t.reference, t.description, p.name AS payee_name,
              e.cleared, CASE WHEN e.debit > 0 THEN e.fx_amount ELSE -e.fx_amount END AS signed
       FROM entries e
       JOIN transactions t ON t.id = e.transaction_id
       LEFT JOIN payees p ON p.id = t.payee_id
       WHERE e.account_id = ? AND t.status = 'posted' AND e.cleared <> 'reconciled' AND t.date <= ?
       ORDER BY t.date, t.id`,
      [accountId, statementDate]
    )
    .map(({ signed, ...rest }) => ({ ...rest, amount: s * signed }));
}

export function setCleared(db: Db, entryId: number, cleared: boolean): void {
  db.runSync(`UPDATE entries SET cleared = ? WHERE id = ? AND cleared <> 'reconciled'`, [
    cleared ? 'cleared' : 'uncleared',
    entryId,
  ]);
}

/**
 * Lock in a reconciliation: requires reconciled + cleared lines to equal the statement balance.
 * Cleared lines become 'reconciled' and can no longer be edited.
 */
export function completeReconciliation(
  db: Db,
  accountId: number,
  statementDate: string,
  statementBalance: number
): number {
  const lines = unreconciledLines(db, accountId, statementDate).filter((l) => l.cleared === 'cleared');
  const cleared = reconciledBalance(db, accountId) + lines.reduce((s, l) => s + l.amount, 0);
  if (cleared !== statementBalance) throw new LedgerError('The cleared balance does not match the statement yet.');
  let id = 0;
  db.withTransactionSync(() => {
    id = db.runSync(
      'INSERT INTO reconciliations (account_id, statement_date, statement_balance, completed_at) VALUES (?, ?, ?, ?)',
      [accountId, statementDate, statementBalance, nowStamp()]
    ).lastInsertRowId;
    for (const l of lines) {
      db.runSync(`UPDATE entries SET cleared = 'reconciled', reconciliation_id = ? WHERE id = ?`, [id, l.entry_id]);
    }
    writeAudit(db, 'create', 'reconciliation', id, null, {
      accountId,
      statementDate,
      statementBalance,
      entries: lines.map((l) => l.entry_id),
    });
  });
  return id;
}

/** Undo the most recent reconciliation of an account (its lines go back to 'cleared'). */
export function undoLastReconciliation(db: Db, accountId: number): void {
  const last = lastReconciliation(db, accountId);
  if (!last) throw new LedgerError('Nothing to undo.');
  db.withTransactionSync(() => {
    db.runSync(`UPDATE entries SET cleared = 'cleared', reconciliation_id = NULL WHERE reconciliation_id = ?`, [last.id]);
    db.runSync('DELETE FROM reconciliations WHERE id = ?', [last.id]);
    writeAudit(db, 'delete', 'reconciliation', last.id, last, null);
  });
}
