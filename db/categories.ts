// Money Manager categories = income/expense accounts, two levels (main › sub), with emoji icons.

import type { Account } from '../domain/types';
import { LedgerError, nowStamp, type Db } from './client';
import { getAccount } from './accounts';
import { writeAudit } from './audit';
import { isSystemAccount } from './seed';
import { getSettings } from './settings';

export type CategoryType = 'income' | 'expense';

export interface CategoryGroup {
  category: Account;
  subcategories: Account[];
}

const ORDER = 'ORDER BY sort_order, code';

/** Main categories with their subcategories, system accounts excluded. */
export function listCategories(db: Db, type: CategoryType, includeHidden = false): CategoryGroup[] {
  const all = db
    .getAllSync<Account>(`SELECT * FROM accounts WHERE type = ? ${includeHidden ? '' : 'AND is_active = 1'} ${ORDER}`, [type])
    .filter((a) => !isSystemAccount(a));
  const tops = all.filter((a) => a.parent_id == null || !all.some((p) => p.id === a.parent_id));
  return tops.map((c) => ({ category: c, subcategories: all.filter((s) => s.parent_id === c.id) }));
}

/** Next unused code in the type's range (codes are internal and never shown). */
export function nextFreeCode(db: Db, type: Account['type']): string {
  const digit = { asset: 1, liability: 2, equity: 3, income: 4, expense: 5 }[type];
  const used = new Set(
    db
      .getAllSync<{ code: string }>(`SELECT code FROM accounts WHERE code LIKE ?`, [`${digit}%`])
      .map((r) => r.code)
  );
  for (let c = digit * 1000 + 1; c < digit * 1000 + 1000; c++) if (!used.has(String(c))) return String(c);
  for (let c = digit * 100000; c < digit * 100000 + 100000; c++) if (!used.has(String(c))) return String(c);
  throw new LedgerError('No account codes left.');
}

export function createCategory(
  db: Db,
  input: { type: CategoryType; name: string; icon: string | null; parentId: number | null }
): number {
  const name = input.name.trim();
  if (!name) throw new LedgerError('Enter a name.');
  if (input.parentId != null) {
    const parent = getAccount(db, input.parentId);
    if (!parent || parent.type !== input.type) throw new LedgerError('Choose a main category of the same type.');
    if (parent.parent_id != null) throw new LedgerError('Subcategories can only be one level deep.');
  }
  const maxOrder =
    db.getFirstSync<{ m: number | null }>(
      'SELECT MAX(sort_order) AS m FROM accounts WHERE type = ? AND parent_id IS ?',
      [input.type, input.parentId]
    )?.m ?? 0;
  let id = 0;
  db.withTransactionSync(() => {
    id = db.runSync(
      `INSERT INTO accounts (code, name, type, subtype, parent_id, currency, is_placeholder, icon, sort_order, created_at)
       VALUES (?, ?, ?, 'general', ?, ?, 0, ?, ?, ?)`,
      [nextFreeCode(db, input.type), name, input.type, input.parentId, getSettings(db).baseCurrency, input.icon, maxOrder + 1, nowStamp()]
    ).lastInsertRowId;
    writeAudit(db, 'create', 'account', id, null, getAccount(db, id));
  });
  return id;
}

export function updateCategory(db: Db, id: number, input: { name: string; icon: string | null }): void {
  const before = getAccount(db, id);
  if (!before || (before.type !== 'income' && before.type !== 'expense')) throw new LedgerError('Category not found.');
  if (!input.name.trim()) throw new LedgerError('Enter a name.');
  db.withTransactionSync(() => {
    db.runSync('UPDATE accounts SET name = ?, icon = ? WHERE id = ?', [input.name.trim(), input.icon, id]);
    writeAudit(db, 'update', 'account', id, before, getAccount(db, id));
  });
}

/** Swap with the previous (-1) or next (+1) sibling. */
export function moveCategory(db: Db, id: number, direction: -1 | 1): void {
  const a = getAccount(db, id);
  if (!a) return;
  const siblings = db
    .getAllSync<Account>(`SELECT * FROM accounts WHERE type = ? AND parent_id IS ? ${ORDER}`, [a.type, a.parent_id])
    .filter((s) => !isSystemAccount(s));
  const i = siblings.findIndex((s) => s.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  const order = siblings.map((s) => s.id);
  [order[i], order[j]] = [order[j], order[i]];
  db.withTransactionSync(() => {
    order.forEach((sid, k) => db.runSync('UPDATE accounts SET sort_order = ? WHERE id = ?', [k, sid]));
  });
}

/**
 * Delete an unused category. Categories with history are hidden instead, so past
 * transactions and reports keep their meaning. Returns what happened.
 */
export function removeCategory(db: Db, id: number): 'deleted' | 'hidden' {
  const a = getAccount(db, id);
  if (!a) return 'deleted';
  if (isSystemAccount(a)) throw new LedgerError('This category is used by the app.');
  const ids = [id, ...db.getAllSync<{ id: number }>('SELECT id FROM accounts WHERE parent_id = ?', [id]).map((r) => r.id)];
  const used =
    db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM entries WHERE account_id IN (${ids.map(() => '?').join(',')})`,
      ids
    )!.n > 0;
  db.withTransactionSync(() => {
    if (used) {
      for (const x of ids) db.runSync('UPDATE accounts SET is_active = 0 WHERE id = ?', [x]);
    } else {
      db.runSync(`UPDATE payees SET default_account_id = NULL WHERE default_account_id IN (${ids.map(() => '?').join(',')})`, ids);
      db.runSync(`DELETE FROM accounts WHERE parent_id = ?`, [id]);
      db.runSync('DELETE FROM accounts WHERE id = ?', [id]);
    }
    writeAudit(db, used ? 'update' : 'delete', 'account', id, a, used ? { ...a, is_active: 0 } : null);
  });
  return used ? 'hidden' : 'deleted';
}

export function restoreCategory(db: Db, id: number): void {
  db.runSync('UPDATE accounts SET is_active = 1 WHERE id = ? OR parent_id = ?', [id, id]);
}
