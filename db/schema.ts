import type { Db } from './client';
import { seedChartOfAccounts } from './seed';

export const DB_NAME = 'ledger.db';
export const DEFAULT_BASE_CURRENCY = 'SGD';

const V1 = `
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  subtype        TEXT NOT NULL DEFAULT 'general'
                 CHECK (subtype IN ('bank','cash','credit_card','loan','investment','receivable','payable','property','general')),
  parent_id      INTEGER REFERENCES accounts(id),
  currency       TEXT NOT NULL,
  is_placeholder INTEGER NOT NULL DEFAULT 0 CHECK (is_placeholder IN (0,1)),
  institution    TEXT,
  account_no     TEXT,
  notes          TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_accounts_parent ON accounts(parent_id);
CREATE INDEX idx_accounts_type ON accounts(type);

CREATE TABLE payees (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  default_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  notes              TEXT
);

CREATE TABLE transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  kind        TEXT NOT NULL CHECK (kind IN ('payment','receipt','transfer','journal','opening','reversal')),
  reference   TEXT NOT NULL,
  payee_id    INTEGER REFERENCES payees(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  memo        TEXT,
  status      TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  void_reason TEXT,
  reverses_id INTEGER REFERENCES transactions(id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_reference ON transactions(reference);
CREATE INDEX idx_transactions_payee ON transactions(payee_id);

CREATE TABLE reconciliations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id        INTEGER NOT NULL REFERENCES accounts(id),
  statement_date    TEXT NOT NULL,
  statement_balance INTEGER NOT NULL,
  completed_at      TEXT NOT NULL
);
CREATE INDEX idx_reconciliations_account ON reconciliations(account_id);

CREATE TABLE entries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id    INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  line_no           INTEGER NOT NULL,
  account_id        INTEGER NOT NULL REFERENCES accounts(id),
  debit             INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit            INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
  currency          TEXT NOT NULL,
  fx_amount         INTEGER NOT NULL CHECK (fx_amount > 0),
  fx_rate           TEXT NOT NULL DEFAULT '1',
  memo              TEXT,
  cleared           TEXT NOT NULL DEFAULT 'uncleared' CHECK (cleared IN ('uncleared','cleared','reconciled')),
  reconciliation_id INTEGER REFERENCES reconciliations(id),
  CHECK ((debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0))
);
CREATE INDEX idx_entries_transaction ON entries(transaction_id);
CREATE INDEX idx_entries_account ON entries(account_id);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  before_json TEXT,
  after_json  TEXT
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
`;

const MIGRATIONS: ((db: Db) => void)[] = [
  (db) => {
    db.execSync(V1);
    db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', ['base_currency', DEFAULT_BASE_CURRENCY]);
    seedChartOfAccounts(db, DEFAULT_BASE_CURRENCY);
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Bring the database up to the latest schema. Safe to call on every launch. */
export function migrate(db: Db): void {
  db.execSync('PRAGMA journal_mode = WAL;');
  db.execSync('PRAGMA foreign_keys = ON;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version', []);
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const step = MIGRATIONS[version];
    db.withTransactionSync(() => {
      step(db);
      db.execSync(`PRAGMA user_version = ${version + 1}`);
    });
    version++;
  }
}
