import { KIND_PREFIX } from '../domain/accounting';
import type { TxKind } from '../domain/types';
import { LedgerError, type Db } from './client';

export interface Settings {
  baseCurrency: string;
  ownerName: string;
  /** Transactions dated on or before this are locked. Empty = no lock. */
  lockDate: string;
  onboarded: boolean;
  /** Day of month a "month" starts (1–28), e.g. payday. */
  monthStartDay: number;
  /** 0 = Sunday, 1 = Monday. */
  weekStart: 0 | 1;
  passcodeEnabled: boolean;
}

export function getSetting(db: Db, key: string): string | null {
  return db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

export function getSettings(db: Db): Settings {
  const rows = db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM settings', []);
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return {
    baseCurrency: m.get('base_currency') ?? 'SGD',
    ownerName: m.get('owner_name') ?? '',
    lockDate: m.get('lock_date') ?? '',
    onboarded: m.get('onboarded') === '1',
    monthStartDay: Math.min(28, Math.max(1, Number(m.get('month_start_day') ?? '1') || 1)),
    weekStart: m.get('week_start') === '1' ? 1 : 0,
    passcodeEnabled: m.get('passcode_enabled') === '1',
  };
}

export function hasEntries(db: Db): boolean {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries', [])!.n > 0;
}

/** Only allowed before any transaction is recorded; moves base-currency accounts with it. */
export function setBaseCurrency(db: Db, code: string): void {
  const current = getSettings(db).baseCurrency;
  if (current === code) return;
  if (hasEntries(db)) throw new LedgerError('The base currency cannot change once transactions exist.');
  db.withTransactionSync(() => {
    db.runSync('UPDATE accounts SET currency = ? WHERE currency = ?', [code, current]);
    db.runSync(`UPDATE accounts SET currency = ? WHERE type IN ('income','expense','equity')`, [code]);
    setSetting(db, 'base_currency', code);
  });
}

/** Next sequential reference for a kind, e.g. PAY-000042. Does not consume the number. */
export function peekReference(db: Db, kind: TxKind): string {
  const n = Number(getSetting(db, `seq_${kind}`) ?? '0') + 1;
  return `${KIND_PREFIX[kind]}-${String(n).padStart(6, '0')}`;
}

export function consumeReference(db: Db, kind: TxKind): string {
  const n = Number(getSetting(db, `seq_${kind}`) ?? '0') + 1;
  setSetting(db, `seq_${kind}`, String(n));
  return `${KIND_PREFIX[kind]}-${String(n).padStart(6, '0')}`;
}
