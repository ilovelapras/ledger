import { toDecimalString } from '../domain/money';
import { LedgerError, type Db } from './client';
import { SCHEMA_VERSION } from './schema';
import { getSettings } from './settings';

// Order matters: parents before children on restore, reverse on wipe.
const TABLES = [
  'settings',
  'accounts',
  'payees',
  'recurrences',
  'transactions',
  'reconciliations',
  'entries',
  'budgets',
  'favorites',
  'attachments',
  'audit_log',
] as const;

export interface Backup {
  app: 'ledger';
  schemaVersion: number;
  exportedAt: string;
  tables: Record<(typeof TABLES)[number], Record<string, unknown>[]>;
}

export function exportBackup(db: Db): Backup {
  const tables = {} as Backup['tables'];
  for (const t of TABLES) tables[t] = db.getAllSync<Record<string, unknown>>(`SELECT * FROM ${t}`, []);
  return { app: 'ledger', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}

/** Replace everything with the backup's contents, atomically. */
export function restoreBackup(db: Db, data: unknown): void {
  const b = data as Backup;
  if (!b || b.app !== 'ledger' || typeof b.tables !== 'object') throw new LedgerError('This is not a Ledger backup file.');
  if (b.schemaVersion > SCHEMA_VERSION) throw new LedgerError('This backup is from a newer version of the app.');
  for (const t of TABLES) {
    // Tables added after the backup was made are simply empty.
    if (b.tables[t] === undefined && b.schemaVersion < SCHEMA_VERSION) b.tables[t] = [];
    if (!Array.isArray(b.tables[t])) throw new LedgerError(`Backup is missing "${t}".`);
  }
  db.execSync('PRAGMA foreign_keys = OFF;');
  try {
    db.withTransactionSync(() => {
      for (const t of [...TABLES].reverse()) db.runSync(`DELETE FROM ${t}`, []);
      db.runSync(`DELETE FROM sqlite_sequence`, []);
      for (const t of TABLES) {
        for (const row of b.tables[t]) {
          const cols = Object.keys(row);
          if (cols.some((c) => !/^[a-z_]+$/.test(c))) throw new LedgerError('Backup contains invalid column names.');
          db.runSync(
            `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            cols.map((c) => row[c] as string | number | null)
          );
        }
      }
      const bad = db.getAllSync<Record<string, unknown>>('PRAGMA foreign_key_check', []);
      if (bad.length) throw new LedgerError('Backup failed integrity checks; nothing was changed.');
    });
  } finally {
    db.execSync('PRAGMA foreign_keys = ON;');
  }
}

/** Wipe all data and re-run first-time setup on next launch. */
export function resetAll(db: Db): void {
  db.execSync('PRAGMA foreign_keys = OFF;');
  try {
    db.withTransactionSync(() => {
      for (const t of [...TABLES].reverse()) db.execSync(`DROP TABLE IF EXISTS ${t}`);
      db.execSync('PRAGMA user_version = 0');
    });
  } finally {
    db.execSync('PRAGMA foreign_keys = ON;');
  }
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** One row per journal line — the format accountants import into spreadsheets. */
export function journalCsv(db: Db, from: string, to: string): string {
  const base = getSettings(db).baseCurrency;
  const rows = db.getAllSync<{
    date: string;
    reference: string;
    kind: string;
    status: string;
    payee: string | null;
    description: string;
    code: string;
    account: string;
    memo: string | null;
    debit: number;
    credit: number;
    currency: string;
    fx_amount: number;
    fx_rate: string;
    cleared: string;
  }>(
    `SELECT t.date, t.reference, t.kind, t.status, p.name AS payee, t.description, a.code, a.name AS account,
            e.memo, e.debit, e.credit, e.currency, e.fx_amount, e.fx_rate, e.cleared
     FROM entries e
     JOIN transactions t ON t.id = e.transaction_id
     JOIN accounts a ON a.id = e.account_id
     LEFT JOIN payees p ON p.id = t.payee_id
     WHERE t.date BETWEEN ? AND ?
     ORDER BY t.date, t.id, e.line_no`,
    [from, to]
  );
  return toCsv([
    [
      'Date', 'Reference', 'Type', 'Status', 'Payee', 'Description', 'Account code', 'Account', 'Line memo',
      `Debit (${base})`, `Credit (${base})`, 'Currency', 'Amount (currency)', 'Rate', 'Cleared',
    ],
    ...rows.map((r) => [
      r.date, r.reference, r.kind, r.status, r.payee, r.description, r.code, r.account, r.memo,
      r.debit ? toDecimalString(r.debit, base) : '',
      r.credit ? toDecimalString(r.credit, base) : '',
      r.currency, toDecimalString(r.fx_amount, r.currency), r.fx_rate, r.cleared,
    ]),
  ]);
}
