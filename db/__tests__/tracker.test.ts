// Money Manager-style features on a real (in-memory) SQLite database.
import { emptyForm, formToEntries, type TxFormValues } from '../../domain/txForm';
import { buildFormContext } from '../formContext';
import { buildPayment } from '../../domain/posting';
import { getAccountByCode, listAccounts } from '../accounts';
import { getBudgetSummary, setBudget } from '../budgets';
import { createCategory, listCategories, moveCategory, removeCategory } from '../categories';
import { exportBackup, restoreBackup } from '../backup';
import { deleteFavorite, listFavorites, saveFavorite } from '../favorites';
import {
  createMoneyAccount,
  getCardStatus,
  getInitialBalance,
  listMoneyAccounts,
  moneyAccountBalances,
  removeMoneyAccount,
  setInitialBalance,
} from '../moneyAccounts';
import { createInstallments, createRepeating, listRecurrences, postDueRecurrences, stopRecurrence } from '../recurrences';
import { getProfitAndLoss, getTrialBalance } from '../reports';
import { migrate } from '../schema';
import { categoryTotals, dailyTotals, listTxRows, noteTotals, sumTotals } from '../stats';
import { createTransaction, voidTransaction } from '../transactions';
import { createTestDb } from './testDb';

function setup() {
  const db = createTestDb();
  const a = (code: string) => getAccountByCode(db, code)!;
  return { db, a };
}

function expense(a: (c: string) => { id: number }, money: string, category: string, amount: string, date: string, note = ''): TxFormValues {
  return {
    ...emptyForm('payment', date),
    moneyAccountId: a(money).id,
    description: note,
    lines: [{ accountId: a(category).id, amount, side: 'dr', rate: '', memo: '' }],
  };
}

describe('Money Manager chart (schema v2)', () => {
  it('fresh books get Money Manager categories and accounts', () => {
    const { db } = setup();
    expect(listMoneyAccounts(db).map((x) => x.name)).toEqual(['Cash', 'Bank Account', 'Card']);
    const exp = listCategories(db, 'expense');
    expect(exp.map((g) => g.category.name)).toContain('Social Life');
    expect(exp.find((g) => g.category.name === 'Food')!.subcategories.map((s) => s.name)).toEqual(['Groceries', 'Eating Out', 'Drinks']);
    // System accounts never show as categories.
    expect(exp.some((g) => g.category.code === '5900' || g.category.code === '5810')).toBe(false);
    expect(listCategories(db, 'income').map((g) => g.category.name)).toEqual(['Salary', 'Bonus', 'Allowance', 'Petty Cash', 'Other']);
  });

  it('books that already have transactions keep their chart and get account groups', () => {
    const db = createTestDb({ migrate: false });
    migrate(db, 1);
    const bank = getAccountByCode(db, '1100')!;
    const card = getAccountByCode(db, '2010')!;
    // Written with v1 columns only, as the v1 app would have.
    const now = '2026-01-01T00:00:00Z';
    const txId = db.runSync(
      `INSERT INTO transactions (date, kind, reference, description, created_at, updated_at) VALUES ('2026-01-01', 'payment', 'PAY-000001', 'v1 entry', ?, ?)`,
      [now, now]
    ).lastInsertRowId;
    db.runSync(
      `INSERT INTO entries (transaction_id, line_no, account_id, debit, credit, currency, fx_amount) VALUES (?, 1, ?, 0, 500, 'SGD', 500), (?, 2, ?, 500, 0, 'SGD', 500)`,
      [txId, bank.id, txId, getAccountByCode(db, '5110')!.id]
    );
    migrate(db);
    expect(getAccountByCode(db, '5110')!.name).toBe('Groceries'); // v1 chart kept
    expect(getAccountByCode(db, '1100')!.grp).toBe('accounts');
    expect(getAccountByCode(db, card.code)!.grp).toBe('card');
    expect(listTxRows(db, { from: '2026-01-01', to: '2026-12-31' })).toHaveLength(1);
  });
});

describe('accounts', () => {
  it('initial balance is equity, not income, and can be changed or cleared', () => {
    const { db, a } = setup();
    setInitialBalance(db, a('1110').id, 250000);
    expect(getInitialBalance(db, a('1110').id).amount).toBe(250000);
    setInitialBalance(db, a('1110').id, 300000);
    expect(getInitialBalance(db, a('1110').id).amount).toBe(300000);
    setInitialBalance(db, a('2010').id, 12000); // card owes 120
    const bal = moneyAccountBalances(db, '2026-10-04');
    expect(bal.find((b) => b.account.code === '1110')!.native).toBe(300000);
    expect(bal.find((b) => b.account.code === '2010')!.native).toBe(12000);
    expect(getProfitAndLoss(db, '1900-01-01', '2999-12-31', false).netIncome).toBe(0);
    expect(listTxRows(db, { from: '1900-01-01', to: '2999-12-31' })).toHaveLength(0); // hidden from lists
    setInitialBalance(db, a('1110').id, 0);
    expect(getInitialBalance(db, a('1110').id).amount).toBe(0);
  });

  it('creates grouped accounts in other currencies; deletes unused, hides used', () => {
    const { db, a } = setup();
    const usd = createMoneyAccount(db, { name: 'USD Wallet', grp: 'cash', currency: 'USD', includeInTotals: true });
    setInitialBalance(db, usd, 10000, '1.35');
    expect(moneyAccountBalances(db, '2026-10-04').find((b) => b.account.id === usd)).toMatchObject({ native: 10000, base: 13500 });
    expect(removeMoneyAccount(db, usd)).toBe('deleted');
    createTransaction(db, {
      date: '2026-10-01',
      kind: 'payment',
      description: '',
      entries: buildPayment({ baseCurrency: 'SGD', money: a('1010'), lines: [{ account: a('5011'), amount: 100 }] }),
    });
    expect(removeMoneyAccount(db, a('1010').id)).toBe('hidden');
    expect(listMoneyAccounts(db).map((x) => x.name)).not.toContain('Cash');
  });

  it('credit card statement: payable vs outstanding', () => {
    const { db, a } = setup();
    const card = createMoneyAccount(db, {
      name: 'Visa',
      grp: 'card',
      currency: 'SGD',
      includeInTotals: true,
      statementDay: 15,
      paymentDay: 5,
      paymentAccountId: a('1110').id,
    });
    const spend = (date: string, cents: number) =>
      createTransaction(db, {
        date,
        kind: 'payment',
        description: '',
        entries: buildPayment({ baseCurrency: 'SGD', money: { id: card, currency: 'SGD', type: 'liability', name: 'Visa' }, lines: [{ account: a('5012'), amount: cents }] }),
      });
    spend('2026-09-10', 30000); // on the Sep 15 statement
    spend('2026-09-20', 5000); // next cycle
    // Pay 100 towards the statement.
    createTransaction(db, {
      date: '2026-10-01',
      kind: 'transfer',
      description: '',
      entries: [
        { account_id: card, debit: 10000, credit: 0, currency: 'SGD', fx_amount: 10000, fx_rate: '1' },
        { account_id: a('1110').id, debit: 0, credit: 10000, currency: 'SGD', fx_amount: 10000, fx_rate: '1' },
      ],
    });
    expect(getCardStatus(db, card, '2026-10-04')).toMatchObject({
      lastClose: '2026-09-15',
      dueDate: '2026-10-05',
      payable: 20000,
      outstanding: 25000,
    });
  });
});

describe('repeat, instalments, favourites', () => {
  it('monthly repeat posts the first now and catches up exactly once', () => {
    const { db, a } = setup();
    createRepeating(db, expense(a, '1110', '5061', '1500', '2026-07-01', 'Rent'), 'monthly', null);
    expect(postDueRecurrences(db, '2026-10-04')).toBe(3); // Aug, Sep, Oct
    expect(postDueRecurrences(db, '2026-10-04')).toBe(0); // idempotent
    const rows = listTxRows(db, { from: '2026-01-01', to: '2026-12-31' });
    expect(rows.map((r) => r.date)).toEqual(['2026-10-01', '2026-09-01', '2026-08-01', '2026-07-01']);
    expect(rows.every((r) => r.recurrence_id != null && r.amount === 150000)).toBe(true);
    const [rec] = listRecurrences(db);
    expect(rec.next_date).toBe('2026-11-01');
    stopRecurrence(db, rec.id);
    expect(postDueRecurrences(db, '2027-12-31')).toBe(0);
  });

  it('repeat stops at the end date', () => {
    const { db, a } = setup();
    createRepeating(db, expense(a, '1010', '5013', '4.50', '2026-10-01'), 'weekly', '2026-10-20');
    expect(postDueRecurrences(db, '2026-12-31')).toBe(2); // 8th, 15th
    expect(listRecurrences(db)[0]).toMatchObject({ active: 0, next_date: null });
  });

  it('a schedule whose account disappears is stopped instead of failing every launch', () => {
    const { db, a } = setup();
    createRepeating(db, expense(a, '1110', '5030', '20', '2026-09-01'), 'monthly', null);
    db.runSync('UPDATE accounts SET is_active = 0 WHERE code = ?', ['5030']);
    expect(postDueRecurrences(db, '2026-10-04')).toBe(0);
    expect(listRecurrences(db)[0].active).toBe(0);
  });

  it('instalments split across months on the card', () => {
    const { db, a } = setup();
    createInstallments(db, expense(a, '2010', '5070', '1000', '2026-10-04', 'Laptop'), 3);
    const rows = listTxRows(db, { from: '2026-01-01', to: '2027-12-31' }).reverse();
    expect(rows.map((r) => [r.date, r.amount, r.installment])).toEqual([
      ['2026-10-04', 33333, '1/3'],
      ['2026-11-04', 33333, '2/3'],
      ['2026-12-04', 33334, '3/3'],
    ]);
  });

  it('favourites round-trip a template', () => {
    const { db, a } = setup();
    const v = expense(a, '1010', '5013', '6.80', '2026-10-04', 'Bubble tea');
    saveFavorite(db, 'Bubble tea', v);
    const [f] = listFavorites(db);
    expect(f.template).toMatchObject({ mode: 'payment', description: 'Bubble tea', lines: [{ amount: '6.80' }] });
    expect(f.template).not.toHaveProperty('date');
    deleteFavorite(db, f.id);
    expect(listFavorites(db)).toHaveLength(0);
  });
});

describe('stats and budgets', () => {
  function activity() {
    const { db, a } = setup();
    const post = (v: TxFormValues) => createRepeatingFree(db, v);
    post(expense(a, '1110', '5011', '80', '2026-10-01', 'NTUC'));
    post(expense(a, '2010', '5012', '45.50', '2026-10-02', 'Dinner'));
    post(expense(a, '1010', '5042', '18', '2026-10-02', 'Grab'));
    post({ ...emptyForm('receipt', '2026-10-01'), moneyAccountId: a('1110').id, description: 'Oct pay', lines: [{ accountId: a('4010').id, amount: '5000', side: 'cr', rate: '', memo: '' }] });
    return { db, a };
  }
  function createRepeatingFree(db: ReturnType<typeof createTestDb>, v: TxFormValues) {
    return createTransaction(db, { date: v.date, kind: v.mode as 'payment', description: v.description, entries: formToEntries(v, buildFormContext(db)) });
  }

  it('daily totals and category roll-ups agree with the P&L', () => {
    const { db } = activity();
    const days = dailyTotals(db, '2026-10-01', '2026-10-31');
    expect(days).toEqual([
      { date: '2026-10-01', income: 500000, expense: 8000 },
      { date: '2026-10-02', income: 0, expense: 6350 },
    ]);
    const t = sumTotals(days, '2026-10-01', '2026-10-31');
    const pl = getProfitAndLoss(db, '2026-10-01', '2026-10-31', false);
    expect(t.income).toBe(pl.income.total);
    expect(t.expense).toBe(pl.expenses.total);

    const cats = categoryTotals(db, 'expense', '2026-10-01', '2026-10-31');
    expect(cats.map((c) => [c.name, c.amount])).toEqual([
      ['Food', 12550],
      ['Transport', 1800],
    ]);
    const food = cats[0];
    expect(categoryTotals(db, 'expense', '2026-10-01', '2026-10-31', food.id).map((c) => c.name).sort()).toEqual(['Eating Out', 'Groceries']);
    expect(noteTotals(db, 'expense', '2026-10-01', '2026-10-31')[0]).toMatchObject({ note: 'NTUC', amount: 8000 });
  });

  it('transaction rows show account, category and amount; deleted ones disappear', () => {
    const { db } = activity();
    const rows = listTxRows(db, { from: '2026-10-01', to: '2026-10-31' });
    const dinner = rows.find((r) => r.description === 'Dinner')!;
    expect(dinner).toMatchObject({ kind: 'payment', account_name: 'Card', category_name: 'Eating Out', parent_category_name: 'Food', amount: 4550 });
    expect(listTxRows(db, { from: '2026-10-01', to: '2026-10-31', search: 'food' })).toHaveLength(2);
    voidTransaction(db, dinner.id, 'Deleted');
    expect(listTxRows(db, { from: '2026-10-01', to: '2026-10-31' })).toHaveLength(3);
    expect(dailyTotals(db, '2026-10-02', '2026-10-02')[0].expense).toBe(1800);
    expect(getTrialBalance(db, '2026-12-31').balanced).toBe(true);
  });

  it('budgets: default, monthly override, over-budget', () => {
    const { db, a } = activity();
    setBudget(db, a('5010').id, '', 10000);
    setBudget(db, a('5040').id, '', 5000);
    let s = getBudgetSummary(db, '2026-10-01', '2026-10-31', '2026-10');
    expect(s.lines.find((l) => l.name === 'Food')).toMatchObject({ budget: 10000, spent: 12550, over: true });
    setBudget(db, a('5010').id, '2026-10', 20000);
    s = getBudgetSummary(db, '2026-10-01', '2026-10-31', '2026-10');
    expect(s.lines.find((l) => l.name === 'Food')).toMatchObject({ budget: 20000, over: false });
    expect(s.totalBudget).toBe(25000);
    expect(getBudgetSummary(db, '2026-11-01', '2026-11-30', '2026-11').totalBudget).toBe(15000);
  });
});

describe('categories', () => {
  it('add, reorder, hide used, delete unused', () => {
    const { db, a } = setup();
    const coffee = createCategory(db, { type: 'expense', name: 'Coffee', icon: '☕', parentId: a('5010').id });
    expect(listCategories(db, 'expense').find((g) => g.category.name === 'Food')!.subcategories.map((s) => s.name)).toContain('Coffee');
    expect(() => createCategory(db, { type: 'expense', name: 'Too deep', icon: null, parentId: coffee })).toThrow(/one level/);
    const before = listCategories(db, 'expense').map((g) => g.category.name);
    moveCategory(db, a('5020').id, -1);
    const after = listCategories(db, 'expense').map((g) => g.category.name);
    expect(after.indexOf('Social Life')).toBe(before.indexOf('Social Life') - 1);
    expect(removeCategory(db, coffee)).toBe('deleted');
    createTransaction(db, {
      date: '2026-10-01',
      kind: 'payment',
      description: '',
      entries: buildPayment({ baseCurrency: 'SGD', money: a('1010'), lines: [{ account: a('5030'), amount: 100 }] }),
    });
    expect(removeCategory(db, a('5030').id)).toBe('hidden');
    expect(listCategories(db, 'expense').map((g) => g.category.name)).not.toContain('Pets');
    expect(listAccounts(db).find((x) => x.code === '5030')).toBeDefined();
  });
});

describe('backup v2', () => {
  it('includes budgets, favourites and schedules', () => {
    const { db, a } = setup();
    setBudget(db, a('5010').id, '', 30000);
    saveFavorite(db, 'Tea', expense(a, '1010', '5013', '3', '2026-10-01'));
    createRepeating(db, expense(a, '1110', '5061', '1500', '2026-10-01'), 'monthly', null);
    const copy = createTestDb();
    restoreBackup(copy, JSON.parse(JSON.stringify(exportBackup(db))));
    expect(listFavorites(copy)).toHaveLength(1);
    expect(listRecurrences(copy)).toHaveLength(1);
    expect(getBudgetSummary(copy, '2026-10-01', '2026-10-31', '2026-10').totalBudget).toBe(30000);
  });

  it('restores a v1 backup that has no v2 tables', () => {
    const { db } = setup();
    const b = JSON.parse(JSON.stringify(exportBackup(db)));
    b.schemaVersion = 1;
    for (const t of ['budgets', 'favorites', 'attachments', 'recurrences']) delete b.tables[t];
    expect(() => restoreBackup(createTestDb(), b)).not.toThrow();
  });
});
