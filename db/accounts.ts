import { getAccountTypeFromCode, isBalanceSheetType } from '../domain/accounting';
import type { Account, AccountSubtype, AccountType } from '../domain/types';
import { LedgerError, nowStamp, type Db } from './client';
import { getSettings } from './settings';
import { writeAudit } from './audit';
import { SYSTEM_CODES } from './seed';

export function listAccounts(db: Db, includeInactive = true): Account[] {
  return db.getAllSync<Account>(
    `SELECT * FROM accounts ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY code`,
    []
  );
}

export function getAccount(db: Db, id: number): Account | null {
  return db.getFirstSync<Account>('SELECT * FROM accounts WHERE id = ?', [id]);
}

export function getAccountByCode(db: Db, code: string): Account | null {
  return db.getFirstSync<Account>('SELECT * FROM accounts WHERE code = ?', [code]);
}

export function requireAccountByCode(db: Db, code: string): Account {
  const a = getAccountByCode(db, code);
  if (!a) throw new LedgerError(`System account ${code} is missing. Restore it in Accounts.`);
  return a;
}

export interface AccountInput {
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  parent_id: number | null;
  currency: string;
  is_placeholder: boolean;
  institution?: string | null;
  account_no?: string | null;
  notes?: string | null;
}

function validate(db: Db, input: AccountInput, id?: number): void {
  if (!/^\d{4,6}$/.test(input.code)) throw new LedgerError('Code must be 4–6 digits.');
  const fromCode = getAccountTypeFromCode(input.code);
  if (fromCode !== input.type)
    throw new LedgerError('Code range must match the type: 1 assets, 2 liabilities, 3 equity, 4 income, 5 expenses.');
  if (!input.name.trim()) throw new LedgerError('Name is required.');
  const dup = getAccountByCode(db, input.code);
  if (dup && dup.id !== id) throw new LedgerError(`Code ${input.code} is already used by "${dup.name}".`);
  const base = getSettings(db).baseCurrency;
  if (!isBalanceSheetType(input.type) || input.type === 'equity') {
    if (input.currency !== base) throw new LedgerError('Income, expense and equity accounts use the base currency.');
  }
  if (input.parent_id != null) {
    const parent = getAccount(db, input.parent_id);
    if (!parent) throw new LedgerError('Parent account not found.');
    if (parent.type !== input.type) throw new LedgerError('Parent must be the same type.');
    if (id != null) {
      // Prevent cycles.
      let p: Account | null = parent;
      let guard = 0;
      while (p && guard++ < 20) {
        if (p.id === id) throw new LedgerError('An account cannot be its own parent.');
        p = p.parent_id != null ? getAccount(db, p.parent_id) : null;
      }
    }
  }
}

function entryCount(db: Db, id: number): number {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE account_id = ?', [id])!.n;
}

export function createAccount(db: Db, input: AccountInput): number {
  validate(db, input);
  let id = 0;
  db.withTransactionSync(() => {
    id = db.runSync(
      `INSERT INTO accounts (code, name, type, subtype, parent_id, currency, is_placeholder, institution, account_no, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.code,
        input.name.trim(),
        input.type,
        input.subtype,
        input.parent_id,
        input.currency,
        input.is_placeholder ? 1 : 0,
        input.institution?.trim() || null,
        input.account_no?.trim() || null,
        input.notes?.trim() || null,
        nowStamp(),
      ]
    ).lastInsertRowId;
    writeAudit(db, 'create', 'account', id, null, getAccount(db, id));
  });
  return id;
}

export function updateAccount(db: Db, id: number, input: AccountInput): void {
  const before = getAccount(db, id);
  if (!before) throw new LedgerError('Account not found.');
  validate(db, input, id);
  const used = entryCount(db, id) > 0;
  if (used && input.type !== before.type) throw new LedgerError('Type cannot change once the account has transactions.');
  if (used && input.currency !== before.currency)
    throw new LedgerError('Currency cannot change once the account has transactions.');
  if (used && input.is_placeholder && !before.is_placeholder)
    throw new LedgerError('An account with transactions cannot become a header.');
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE accounts SET code = ?, name = ?, type = ?, subtype = ?, parent_id = ?, currency = ?, is_placeholder = ?,
         institution = ?, account_no = ?, notes = ? WHERE id = ?`,
      [
        input.code,
        input.name.trim(),
        input.type,
        input.subtype,
        input.parent_id,
        input.currency,
        input.is_placeholder ? 1 : 0,
        input.institution?.trim() || null,
        input.account_no?.trim() || null,
        input.notes?.trim() || null,
        id,
      ]
    );
    writeAudit(db, 'update', 'account', id, before, getAccount(db, id));
  });
}

export function setAccountActive(db: Db, id: number, active: boolean): void {
  db.runSync('UPDATE accounts SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
}

/** Only unused accounts with no children can be deleted; otherwise deactivate. */
export function deleteAccount(db: Db, id: number): void {
  const before = getAccount(db, id);
  if (!before) return;
  if (entryCount(db, id) > 0) throw new LedgerError('This account has transactions. Deactivate it instead.');
  const kids = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM accounts WHERE parent_id = ?', [id])!.n;
  if (kids > 0) throw new LedgerError('Move or delete its sub-accounts first.');
  if ((Object.values(SYSTEM_CODES) as string[]).includes(before.code))
    throw new LedgerError('This account is used by the app and cannot be deleted.');
  db.withTransactionSync(() => {
    db.runSync('UPDATE payees SET default_account_id = NULL WHERE default_account_id = ?', [id]);
    db.runSync('DELETE FROM accounts WHERE id = ?', [id]);
    writeAudit(db, 'delete', 'account', id, before, null);
  });
}

/** Suggest the next free code under a parent (or in the type's range). */
export function suggestCode(db: Db, type: AccountType, parentId: number | null): string {
  const digit = { asset: 1, liability: 2, equity: 3, income: 4, expense: 5 }[type];
  const parent = parentId != null ? getAccount(db, parentId) : null;
  const start = parent ? Number(parent.code) + 10 : digit * 1000;
  const end = parent ? Number(parent.code) + 99 : digit * 1000 + 999;
  const used = new Set(
    db
      .getAllSync<{ code: string }>('SELECT code FROM accounts WHERE code BETWEEN ? AND ?', [String(start), String(end)])
      .map((r) => r.code)
  );
  for (let c = start; c <= end; c += parent ? 10 : 100) if (!used.has(String(c))) return String(c);
  for (let c = start; c <= end; c++) if (!used.has(String(c))) return String(c);
  return '';
}
