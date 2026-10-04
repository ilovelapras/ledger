import type { Payee } from '../domain/types';
import { LedgerError, type Db } from './client';

export function listPayees(db: Db): (Payee & { tx_count: number })[] {
  return db.getAllSync(
    `SELECT p.*, (SELECT COUNT(*) FROM transactions t WHERE t.payee_id = p.id) AS tx_count
     FROM payees p ORDER BY p.name COLLATE NOCASE`,
    []
  );
}

export function getPayee(db: Db, id: number): Payee | null {
  return db.getFirstSync<Payee>('SELECT * FROM payees WHERE id = ?', [id]);
}

/** Find by name (case-insensitive) or create. Returns null for a blank name. */
export function ensurePayee(db: Db, name: string): number | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = db.getFirstSync<{ id: number }>('SELECT id FROM payees WHERE name = ? COLLATE NOCASE', [trimmed]);
  if (existing) return existing.id;
  return db.runSync('INSERT INTO payees (name) VALUES (?)', [trimmed]).lastInsertRowId;
}

export function updatePayee(db: Db, id: number, name: string, defaultAccountId: number | null, notes: string | null): void {
  if (!name.trim()) throw new LedgerError('Name is required.');
  const dup = db.getFirstSync<{ id: number }>('SELECT id FROM payees WHERE name = ? COLLATE NOCASE AND id <> ?', [
    name.trim(),
    id,
  ]);
  if (dup) throw new LedgerError('Another payee already has that name.');
  db.runSync('UPDATE payees SET name = ?, default_account_id = ?, notes = ? WHERE id = ?', [
    name.trim(),
    defaultAccountId,
    notes?.trim() || null,
    id,
  ]);
}

export function setPayeeDefaultAccount(db: Db, id: number, accountId: number): void {
  db.runSync('UPDATE payees SET default_account_id = ? WHERE id = ?', [accountId, id]);
}

/** Deleting a payee keeps its transactions (payee is cleared on them). */
export function deletePayee(db: Db, id: number): void {
  db.runSync('DELETE FROM payees WHERE id = ?', [id]);
}
