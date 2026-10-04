import * as SQLite from 'expo-sqlite';

export const DB_NAME = 'ledger.db';

export function getDb() {
  return SQLite.openDatabaseSync(DB_NAME);
}

export function initSchema(db: SQLite.SQLiteDatabase) {
  db.execSync(`
    PRAGMA foreign_keys = ON;
    
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
      parent_id INTEGER REFERENCES accounts(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      debit REAL NOT NULL DEFAULT 0 CHECK (debit >= 0),
      credit REAL NOT NULL DEFAULT 0 CHECK (credit >= 0),
      CHECK ((debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0))
    );
    
    CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
    CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_id);
    CREATE INDEX IF NOT EXISTS idx_entries_transaction ON entries(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_entries_account ON entries(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  `);
  
  // Ensure tables exist by running a simple query
  try {
    db.execSync('SELECT 1 FROM accounts LIMIT 1');
    db.execSync('SELECT 1 FROM transactions LIMIT 1');
    db.execSync('SELECT 1 FROM entries LIMIT 1');
  } catch (e) {
    // Tables don't exist - create them explicitly
    db.execSync(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, type TEXT NOT NULL, parent_id INTEGER, is_active INTEGER, created_at TEXT);
      CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, description TEXT NOT NULL, reference TEXT, created_at TEXT);
      CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER, account_id INTEGER, debit REAL DEFAULT 0, credit REAL DEFAULT 0);
    `);
  }
}

export function seedDefaultAccounts(db: SQLite.SQLiteDatabase) {
  // First ensure tables exist
  try {
    db.execSync('SELECT 1 FROM accounts LIMIT 1');
    db.execSync('SELECT 1 FROM transactions LIMIT 1');
    db.execSync('SELECT 1 FROM entries LIMIT 1');
  } catch (e) {
    // Tables don't exist - create them
    db.execSync(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, type TEXT NOT NULL, parent_id INTEGER, is_active INTEGER, created_at TEXT);
      CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, description TEXT NOT NULL, reference TEXT, created_at TEXT);
      CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER, account_id INTEGER, debit REAL DEFAULT 0, credit REAL DEFAULT 0);
    `);
  }
  
  const count = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM accounts');
  if (count && count.cnt > 0) return;

  const now = new Date().toISOString();
  const accounts = [
    { code: '1000', name: 'Cash', type: 'asset', parent_id: null },
    { code: '1100', name: 'Bank Account', type: 'asset', parent_id: null },
    { code: '1200', name: 'Accounts Receivable', type: 'asset', parent_id: null },
    { code: '1500', name: 'Equipment', type: 'asset', parent_id: null },
    { code: '2000', name: 'Accounts Payable', type: 'liability', parent_id: null },
    { code: '2100', name: 'Credit Card', type: 'liability', parent_id: null },
    { code: '2200', name: 'Loans Payable', type: 'liability', parent_id: null },
    { code: '3000', name: 'Owner Equity', type: 'equity', parent_id: null },
    { code: '3100', name: 'Retained Earnings', type: 'equity', parent_id: null },
    { code: '4000', name: 'Revenue', type: 'income', parent_id: null },
    { code: '4100', name: 'Sales', type: 'income', parent_id: null },
    { code: '4200', name: 'Service Income', type: 'income', parent_id: null },
    { code: '5000', name: 'Expenses', type: 'expense', parent_id: null },
    { code: '5100', name: 'Rent', type: 'expense', parent_id: null },
    { code: '5200', name: 'Utilities', type: 'expense', parent_id: null },
    { code: '5300', name: 'Office Supplies', type: 'expense', parent_id: null },
    { code: '5400', name: 'Travel', type: 'expense', parent_id: null },
  ];

  const stmt = db.prepareSync(
    'INSERT INTO accounts (code, name, type, parent_id, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  
  for (const acc of accounts) {
    stmt.executeSync([acc.code, acc.name, acc.type, acc.parent_id, now]);
  }
  
  stmt.finalizeSync();
}

export function runMigrations(db: SQLite.SQLiteDatabase) {
  initSchema(db);
  seedDefaultAccounts(db);
}