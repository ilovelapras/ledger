import { buildOpeningBalance, buildPayment, buildReceipt, buildTransfer } from '../../domain/posting';
import type { Account } from '../../domain/types';
import { createAccount, getAccountByCode, listAccounts, requireAccountByCode, deleteAccount } from '../accounts';
import { exportBackup, journalCsv, resetAll, restoreBackup } from '../backup';
import type { Db } from '../client';
import { completeReconciliation, setCleared, unreconciledLines, undoLastReconciliation } from '../reconcile';
import { bookRate, getAccountLedger, getBalanceSheet, getProfitAndLoss, getTrialBalance } from '../reports';
import { migrate } from '../schema';
import { SYSTEM_CODES } from '../seed';
import { getSettings, setBaseCurrency, setSetting } from '../settings';
import { ensurePayee } from '../payees';
import {
  createTransaction,
  getTransaction,
  listTransactions,
  reverseTransaction,
  updateTransaction,
  voidTransaction,
  toInput,
} from '../transactions';
import { createTestDb } from './testDb';

function setup() {
  const db = createTestDb();
  const a = (code: string) => getAccountByCode(db, code)!;
  return { db, a };
}

function seedActivity(db: Db, a: (code: string) => Account) {
  const base = 'SGD';
  const obe = a(SYSTEM_CODES.openingEquity);
  const bank = a('1100');
  const card = a('2010');
  const usdId = createAccount(db, {
    code: '1120',
    name: 'USD Account',
    type: 'asset',
    subtype: 'bank',
    parent_id: a('1000').id,
    currency: 'USD',
    is_placeholder: false,
  });
  const usd = listAccounts(db).find((x) => x.id === usdId)!;

  createTransaction(db, {
    date: '2025-12-31',
    kind: 'opening',
    description: 'Opening balance',
    entries: buildOpeningBalance({ baseCurrency: base, account: bank, amount: 1000000, openingEquity: obe }),
  });
  createTransaction(db, {
    date: '2025-12-31',
    kind: 'opening',
    description: 'Opening balance',
    entries: buildOpeningBalance({ baseCurrency: base, account: card, amount: 50000, openingEquity: obe }),
  });
  // Prior-year income so retained earnings is non-zero.
  createTransaction(db, {
    date: '2025-06-30',
    kind: 'receipt',
    description: 'Freelance',
    entries: buildReceipt({ baseCurrency: base, money: bank, lines: [{ account: a('4800'), amount: 20000 }] }),
  });
  createTransaction(db, {
    date: '2026-01-25',
    kind: 'receipt',
    payee_id: ensurePayee(db, 'Acme Pte Ltd'),
    description: 'January salary',
    entries: buildReceipt({ baseCurrency: base, money: bank, lines: [{ account: a('4010'), amount: 600000 }] }),
  });
  const groceryId = createTransaction(db, {
    date: '2026-01-26',
    kind: 'payment',
    payee_id: ensurePayee(db, 'FairPrice'),
    description: 'Weekly shop',
    entries: buildPayment({
      baseCurrency: base,
      money: card,
      lines: [
        { account: a('5110'), amount: 8650 },
        { account: a('5720'), amount: 2000 },
      ],
    }),
  });
  createTransaction(db, {
    date: '2026-02-01',
    kind: 'transfer',
    description: 'Buy USD',
    entries: buildTransfer({
      baseCurrency: base,
      from: bank,
      to: usd,
      sent: 135000,
      received: 100000,
      fxGainAccount: a(SYSTEM_CODES.fxGain),
      fxLossAccount: a(SYSTEM_CODES.fxLoss),
    }),
  });
  return { bank, card, usd, groceryId };
}

describe('schema and seed', () => {
  it('migrates idempotently and seeds the chart of accounts', () => {
    const { db } = setup();
    migrate(db);
    const accounts = listAccounts(db);
    expect(accounts.length).toBeGreaterThan(40);
    for (const code of Object.values(SYSTEM_CODES)) expect(getAccountByCode(db, code)).not.toBeNull();
    expect(getSettings(db).baseCurrency).toBe('SGD');
  });

  it('sets aside tables from the unversioned prototype database instead of failing', () => {
    const db = createTestDb({ migrate: false });
    // Schema created by the earlier prototype (no user_version, REAL money, clashing index names).
    db.execSync(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        type TEXT NOT NULL, parent_id INTEGER REFERENCES accounts(id), is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT);
      CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, description TEXT NOT NULL,
        reference TEXT, created_at TEXT);
      CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER REFERENCES transactions(id),
        account_id INTEGER REFERENCES accounts(id), debit REAL DEFAULT 0, credit REAL DEFAULT 0);
      CREATE INDEX idx_accounts_type ON accounts(type);
      CREATE INDEX idx_entries_account ON entries(account_id);
      CREATE INDEX idx_transactions_date ON transactions(date);
      INSERT INTO accounts (code, name, type) VALUES ('1000', 'Cash', 'asset');
    `);
    migrate(db);
    expect(listAccounts(db).length).toBeGreaterThan(40);
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM legacy_accounts', [])!.n).toBe(1);
    expect(getSettings(db).baseCurrency).toBe('SGD');
    migrate(db); // second launch is a no-op
  });

  it('changes base currency before any transactions only', () => {
    const { db, a } = setup();
    setBaseCurrency(db, 'MYR');
    expect(a('1100').currency).toBe('MYR');
    expect(a('5110').currency).toBe('MYR');
    createTransaction(db, {
      date: '2026-01-01',
      kind: 'opening',
      description: '',
      entries: buildOpeningBalance({ baseCurrency: 'MYR', account: a('1100'), amount: 100, openingEquity: a('3000') }),
    });
    expect(() => setBaseCurrency(db, 'SGD')).toThrow();
  });

  it('enforces the one-sided line CHECK at the database level', () => {
    const { db, a } = setup();
    const id = createTransaction(db, {
      date: '2026-01-01',
      kind: 'journal',
      description: '',
      entries: buildOpeningBalance({ baseCurrency: 'SGD', account: a('1100'), amount: 100, openingEquity: a('3000') }),
    });
    expect(() =>
      db.runSync(
        'INSERT INTO entries (transaction_id, line_no, account_id, debit, credit, currency, fx_amount) VALUES (?,?,?,?,?,?,?)',
        [id, 9, a('1100').id, 5, 5, 'SGD', 5]
      )
    ).toThrow();
  });
});

describe('posting rules', () => {
  it('assigns sequential references per kind', () => {
    const { db, a } = setup();
    seedActivity(db, a);
    const refs = listTransactions(db, { status: 'all' }).map((t) => t.reference).sort();
    expect(refs).toEqual(['OPB-000001', 'OPB-000002', 'PAY-000001', 'RCT-000001', 'RCT-000002', 'TRF-000001']);
  });

  it('rejects unbalanced entries, header accounts and locked periods', () => {
    const { db, a } = setup();
    const bank = a('1100');
    const line = (account: Account, debit: number, credit: number) => ({
      account_id: account.id,
      debit,
      credit,
      currency: 'SGD',
      fx_amount: debit || credit,
      fx_rate: '1',
    });
    expect(() =>
      createTransaction(db, { date: '2026-01-01', kind: 'journal', description: '', entries: [line(bank, 100, 0), line(a('5110'), 0, 99)] })
    ).toThrow(/balance/);
    expect(() =>
      createTransaction(db, { date: '2026-01-01', kind: 'journal', description: '', entries: [line(a('1000'), 100, 0), line(a('5110'), 0, 100)] })
    ).toThrow(/header/);
    setSetting(db, 'lock_date', '2026-01-31');
    expect(() =>
      createTransaction(db, { date: '2026-01-15', kind: 'journal', description: '', entries: [line(bank, 100, 0), line(a('3000'), 0, 100)] })
    ).toThrow(/locked/);
    expect(listTransactions(db, { status: 'all' })).toHaveLength(0);
  });

  it('learns the payee default category', () => {
    const { db, a } = setup();
    seedActivity(db, a);
    const p = db.getFirstSync<{ default_account_id: number }>(`SELECT default_account_id FROM payees WHERE name = 'FairPrice'`, []);
    expect(p?.default_account_id).toBe(a('5110').id);
  });

  it('edits write an audit trail; void removes from balances; reversal nets to zero', () => {
    const { db, a } = setup();
    const { groceryId, card } = seedActivity(db, a);
    const tx = getTransaction(db, groceryId)!;
    const input = toInput(tx);
    input.description = 'Weekly shop (edited)';
    updateTransaction(db, groceryId, input);
    const audit = db.getAllSync<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity = 'transaction' AND entity_id = ? ORDER BY id`,
      [groceryId]
    );
    expect(audit.map((x) => x.action)).toEqual(['create', 'update']);

    const before = getTrialBalance(db, '2026-12-31');
    const rev = reverseTransaction(db, groceryId, '2026-03-01');
    expect(getTransaction(db, rev)!.kind).toBe('reversal');
    expect(() => reverseTransaction(db, groceryId, '2026-03-01')).toThrow(/already/);
    const cardAfter = getAccountLedger(db, card.id, '2000-01-01', '2026-12-31')!;
    expect(cardAfter.closingBase).toBe(50000); // opening balance only

    voidTransaction(db, rev, 'Entered twice');
    const after = getTrialBalance(db, '2026-12-31');
    expect(after.totalDebit).toBe(before.totalDebit);
    expect(() => voidTransaction(db, rev, 'again')).toThrow(/void/);
  });
});

describe('reports', () => {
  it('trial balance balances and balance sheet equation holds', () => {
    const { db, a } = setup();
    seedActivity(db, a);
    const tb = getTrialBalance(db, '2026-12-31');
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBeGreaterThan(0);

    const bs = getBalanceSheet(db, '2026-12-31');
    expect(bs.difference).toBe(0);
    expect(bs.retainedEarnings).toBe(20000);
    expect(bs.currentEarnings).toBe(600000 - 10650);
    // Bank: 10,000 + 200 + 6,000 − 1,350 = 14,850; USD acct 1,350; card liability 500 + 106.50
    expect(bs.assets.total).toBe(1000000 + 20000 + 600000 - 135000 + 135000);
    expect(bs.liabilities.total).toBe(50000 + 10650);
  });

  it('balance sheet as of a past date excludes later activity', () => {
    const { db, a } = setup();
    seedActivity(db, a);
    const bs = getBalanceSheet(db, '2025-12-31');
    expect(bs.difference).toBe(0);
    expect(bs.currentEarnings).toBe(20000);
    expect(bs.retainedEarnings).toBe(0);
  });

  it('profit and loss for a period with comparison', () => {
    const { db, a } = setup();
    seedActivity(db, a);
    const pl = getProfitAndLoss(db, '2026-01-01', '2026-01-31', true);
    expect(pl.income.total).toBe(600000);
    expect(pl.expenses.total).toBe(10650);
    expect(pl.netIncome).toBe(589350);
    expect(pl.compareNetIncome).toBe(0);
    // Header rows roll up children.
    const food = pl.expenses.rows.find((r) => r.code === '5100')!;
    expect(food).toMatchObject({ isHeader: true, amount: 8650 });
  });

  it('account ledger has opening balance and running balance in both currencies', () => {
    const { db, a } = setup();
    const { usd, bank } = seedActivity(db, a);
    const l = getAccountLedger(db, bank.id, '2026-01-01', '2026-12-31')!;
    expect(l.openingBase).toBe(1020000);
    expect(l.lines.map((x) => x.balance)).toEqual([1620000, 1485000]);
    const u = getAccountLedger(db, usd.id, '2026-01-01', '2026-12-31')!;
    expect(u.closingNative).toBe(100000);
    expect(u.closingBase).toBe(135000);
    expect(bookRate(db, usd.id, '2026-12-31')).toBe('1.35');
  });

  it('search finds by payee, account and amount', () => {
    const { db, a } = setup();
    seedActivity(db, a);
    expect(listTransactions(db, { search: 'fairprice' })).toHaveLength(1);
    expect(listTransactions(db, { search: 'Groceries' })).toHaveLength(1);
    expect(listTransactions(db, { search: '106.50' })).toHaveLength(1);
    expect(listTransactions(db, { accountId: a('1100').id })).toHaveLength(4);
  });
});

describe('reconciliation', () => {
  it('requires the cleared balance to match, then locks the lines', () => {
    const { db, a } = setup();
    const { card, groceryId } = seedActivity(db, a);
    const lines = unreconciledLines(db, card.id, '2026-01-31');
    expect(lines).toHaveLength(2);
    expect(() => completeReconciliation(db, card.id, '2026-01-31', 60650)).toThrow(/match/);
    lines.forEach((l) => setCleared(db, l.entry_id, true));
    completeReconciliation(db, card.id, '2026-01-31', 60650);
    expect(unreconciledLines(db, card.id, '2026-01-31')).toHaveLength(0);
    expect(() => voidTransaction(db, groceryId, 'x')).toThrow(/reconciliation/);
    undoLastReconciliation(db, card.id);
    expect(unreconciledLines(db, card.id, '2026-01-31')).toHaveLength(2);
  });
});

describe('accounts', () => {
  it('validates code ranges and protects used/system accounts', () => {
    const { db, a } = setup();
    seedActivity(db, a);
    expect(() =>
      createAccount(db, { code: '5999', name: 'Wrong', type: 'asset', subtype: 'general', parent_id: null, currency: 'SGD', is_placeholder: false })
    ).toThrow(/range/);
    expect(() =>
      createAccount(db, { code: '5999', name: 'USD expense', type: 'expense', subtype: 'general', parent_id: null, currency: 'USD', is_placeholder: false })
    ).toThrow(/base currency/);
    expect(() => deleteAccount(db, a('1100').id)).toThrow(/Deactivate/);
    expect(() => deleteAccount(db, requireAccountByCode(db, '4900').id)).toThrow(/used by the app/);
    deleteAccount(db, a('5500').id);
    expect(getAccountByCode(db, '5500')).toBeNull();
  });
});

describe('backup', () => {
  it('round-trips through export/restore and exports CSV', () => {
    const { db, a } = setup();
    seedActivity(db, a);
    const backup = JSON.parse(JSON.stringify(exportBackup(db)));
    const tbBefore = getTrialBalance(db, '2026-12-31');

    const other = createTestDb();
    restoreBackup(other, backup);
    expect(getTrialBalance(other, '2026-12-31')).toEqual(tbBefore);
    expect(listTransactions(other)).toHaveLength(6);

    const csv = journalCsv(db, '2026-01-01', '2026-12-31');
    expect(csv.split('\r\n')[0]).toContain('Debit (SGD)');
    expect(csv).toContain('"Groceries"'.replace(/"/g, ''));

    resetAll(db);
    migrate(db);
    expect(listTransactions(db)).toHaveLength(0);
  });

  it('rejects files that are not backups', () => {
    const { db } = setup();
    expect(() => restoreBackup(db, { hello: 1 })).toThrow(/not a Ledger backup/);
  });
});
