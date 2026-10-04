import type { AccountSubtype, AccountType } from '../domain/types';
import { nowStamp, type Db } from './client';

interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
  subtype?: AccountSubtype;
  parent?: string;
  placeholder?: boolean;
}

// Personal chart of accounts. Codes: 1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx income, 5xxx expenses.
export const DEFAULT_CHART: SeedAccount[] = [
  { code: '1000', name: 'Cash & Bank', type: 'asset', placeholder: true },
  { code: '1010', name: 'Cash on Hand', type: 'asset', subtype: 'cash', parent: '1000' },
  { code: '1100', name: 'Current Account', type: 'asset', subtype: 'bank', parent: '1000' },
  { code: '1110', name: 'Savings Account', type: 'asset', subtype: 'bank', parent: '1000' },
  { code: '1200', name: 'Investments', type: 'asset', placeholder: true },
  { code: '1210', name: 'Brokerage Account', type: 'asset', subtype: 'investment', parent: '1200' },
  { code: '1220', name: 'Fixed Deposits', type: 'asset', subtype: 'investment', parent: '1200' },
  { code: '1300', name: 'Money Owed to Me', type: 'asset', subtype: 'receivable' },
  { code: '1400', name: 'Deposits & Prepayments', type: 'asset', subtype: 'general' },
  { code: '1500', name: 'Property & Vehicles', type: 'asset', placeholder: true },
  { code: '1510', name: 'Home', type: 'asset', subtype: 'property', parent: '1500' },
  { code: '1520', name: 'Vehicle', type: 'asset', subtype: 'property', parent: '1500' },

  { code: '2000', name: 'Credit Cards', type: 'liability', placeholder: true },
  { code: '2010', name: 'Credit Card', type: 'liability', subtype: 'credit_card', parent: '2000' },
  { code: '2100', name: 'Loans', type: 'liability', placeholder: true },
  { code: '2110', name: 'Home Loan', type: 'liability', subtype: 'loan', parent: '2100' },
  { code: '2120', name: 'Car Loan', type: 'liability', subtype: 'loan', parent: '2100' },
  { code: '2130', name: 'Personal Loan', type: 'liability', subtype: 'loan', parent: '2100' },
  { code: '2200', name: 'Money I Owe', type: 'liability', subtype: 'payable' },

  { code: '3000', name: 'Opening Balance Equity', type: 'equity' },
  { code: '3100', name: 'Retained Earnings', type: 'equity' },

  { code: '4000', name: 'Employment Income', type: 'income', placeholder: true },
  { code: '4010', name: 'Salary', type: 'income', parent: '4000' },
  { code: '4020', name: 'Bonus', type: 'income', parent: '4000' },
  { code: '4100', name: 'Investment Income', type: 'income', placeholder: true },
  { code: '4110', name: 'Interest', type: 'income', parent: '4100' },
  { code: '4120', name: 'Dividends', type: 'income', parent: '4100' },
  { code: '4130', name: 'Rental Income', type: 'income', parent: '4100' },
  { code: '4800', name: 'Other Income', type: 'income' },
  { code: '4900', name: 'Exchange Gain', type: 'income' },

  { code: '5000', name: 'Housing', type: 'expense', placeholder: true },
  { code: '5010', name: 'Rent / Mortgage Interest', type: 'expense', parent: '5000' },
  { code: '5020', name: 'Utilities', type: 'expense', parent: '5000' },
  { code: '5030', name: 'Home Maintenance', type: 'expense', parent: '5000' },
  { code: '5100', name: 'Food', type: 'expense', placeholder: true },
  { code: '5110', name: 'Groceries', type: 'expense', parent: '5100' },
  { code: '5120', name: 'Dining Out', type: 'expense', parent: '5100' },
  { code: '5200', name: 'Transport', type: 'expense' },
  { code: '5300', name: 'Insurance', type: 'expense' },
  { code: '5400', name: 'Medical', type: 'expense' },
  { code: '5500', name: 'Education', type: 'expense' },
  { code: '5600', name: 'Phone & Internet', type: 'expense' },
  { code: '5700', name: 'Lifestyle', type: 'expense', placeholder: true },
  { code: '5710', name: 'Entertainment', type: 'expense', parent: '5700' },
  { code: '5720', name: 'Shopping', type: 'expense', parent: '5700' },
  { code: '5730', name: 'Travel', type: 'expense', parent: '5700' },
  { code: '5740', name: 'Gifts & Donations', type: 'expense', parent: '5700' },
  { code: '5800', name: 'Finance Costs', type: 'expense', placeholder: true },
  { code: '5810', name: 'Bank Charges', type: 'expense', parent: '5800' },
  { code: '5820', name: 'Loan Interest', type: 'expense', parent: '5800' },
  { code: '5830', name: 'Income Tax', type: 'expense', parent: '5800' },
  { code: '5890', name: 'Miscellaneous', type: 'expense' },
  { code: '5900', name: 'Exchange Loss', type: 'expense' },
];

/** Money Manager account groups. Card, overdraft and loan hold what you owe (liabilities). */
export const ACCOUNT_GROUPS = [
  { key: 'cash', label: 'Cash', type: 'asset', subtype: 'cash', icon: '💵' },
  { key: 'accounts', label: 'Accounts', type: 'asset', subtype: 'bank', icon: '🏦' },
  { key: 'card', label: 'Card', type: 'liability', subtype: 'credit_card', icon: '💳' },
  { key: 'debit_card', label: 'Debit Card', type: 'asset', subtype: 'bank', icon: '💳' },
  { key: 'savings', label: 'Savings', type: 'asset', subtype: 'bank', icon: '🐖' },
  { key: 'prepaid', label: 'Top-Up/Prepaid', type: 'asset', subtype: 'cash', icon: '📱' },
  { key: 'investments', label: 'Investments', type: 'asset', subtype: 'investment', icon: '📈' },
  { key: 'overdraft', label: 'Overdrafts', type: 'liability', subtype: 'loan', icon: '🧾' },
  { key: 'loan', label: 'Loan', type: 'liability', subtype: 'loan', icon: '🏛️' },
  { key: 'insurance', label: 'Insurance', type: 'asset', subtype: 'general', icon: '🛡️' },
  { key: 'others', label: 'Others', type: 'asset', subtype: 'general', icon: '📁' },
] as const satisfies readonly { key: string; label: string; type: AccountType; subtype: AccountSubtype; icon: string }[];

export type AccountGroup = (typeof ACCOUNT_GROUPS)[number]['key'];

export function groupInfo(key: string | null | undefined) {
  return ACCOUNT_GROUPS.find((g) => g.key === key) ?? ACCOUNT_GROUPS[ACCOUNT_GROUPS.length - 1];
}

/** Map a v1 subtype to a Money Manager group (used when upgrading books that already have transactions). */
export function groupForSubtype(type: AccountType, subtype: AccountSubtype): AccountGroup {
  if (type === 'liability') return subtype === 'credit_card' ? 'card' : 'loan';
  switch (subtype) {
    case 'cash': return 'cash';
    case 'bank': return 'accounts';
    case 'investment': return 'investments';
    default: return 'others';
  }
}

interface MMSeed {
  code: string;
  name: string;
  type: AccountType;
  icon: string;
  parent?: string;
  group?: AccountGroup;
}

// Money Manager's default categories and accounts.
export const MM_CHART: MMSeed[] = [
  { code: '1010', name: 'Cash', type: 'asset', icon: '💵', group: 'cash' },
  { code: '1110', name: 'Bank Account', type: 'asset', icon: '🏦', group: 'accounts' },
  { code: '2010', name: 'Card', type: 'liability', icon: '💳', group: 'card' },

  { code: '4010', name: 'Salary', type: 'income', icon: '💰' },
  { code: '4020', name: 'Bonus', type: 'income', icon: '🎉' },
  { code: '4030', name: 'Allowance', type: 'income', icon: '👛' },
  { code: '4040', name: 'Petty Cash', type: 'income', icon: '🪙' },
  { code: '4090', name: 'Other', type: 'income', icon: '📥' },

  { code: '5010', name: 'Food', type: 'expense', icon: '🍜' },
  { code: '5011', name: 'Groceries', type: 'expense', icon: '🛒', parent: '5010' },
  { code: '5012', name: 'Eating Out', type: 'expense', icon: '🍽️', parent: '5010' },
  { code: '5013', name: 'Drinks', type: 'expense', icon: '🧋', parent: '5010' },
  { code: '5020', name: 'Social Life', type: 'expense', icon: '🥂' },
  { code: '5030', name: 'Pets', type: 'expense', icon: '🐶' },
  { code: '5040', name: 'Transport', type: 'expense', icon: '🚌' },
  { code: '5041', name: 'Public Transport', type: 'expense', icon: '🚇', parent: '5040' },
  { code: '5042', name: 'Taxi', type: 'expense', icon: '🚕', parent: '5040' },
  { code: '5043', name: 'Fuel', type: 'expense', icon: '⛽', parent: '5040' },
  { code: '5044', name: 'Parking', type: 'expense', icon: '🅿️', parent: '5040' },
  { code: '5050', name: 'Culture', type: 'expense', icon: '🎬' },
  { code: '5060', name: 'Household', type: 'expense', icon: '🏠' },
  { code: '5061', name: 'Rent', type: 'expense', icon: '🔑', parent: '5060' },
  { code: '5062', name: 'Utilities', type: 'expense', icon: '💡', parent: '5060' },
  { code: '5063', name: 'Supplies', type: 'expense', icon: '🧻', parent: '5060' },
  { code: '5070', name: 'Apparel', type: 'expense', icon: '👕' },
  { code: '5080', name: 'Beauty', type: 'expense', icon: '💄' },
  { code: '5090', name: 'Health', type: 'expense', icon: '💊' },
  { code: '5100', name: 'Education', type: 'expense', icon: '📚' },
  { code: '5110', name: 'Gift', type: 'expense', icon: '🎁' },
  { code: '5190', name: 'Other', type: 'expense', icon: '📦' },
];

/** System accounts kept from v1 (codes unchanged) with Money Manager-friendly names/icons. */
const MM_SYSTEM: { code: string; name: string; icon: string }[] = [
  { code: '3000', name: 'Opening Balance Equity', icon: '⚖️' },
  { code: '3100', name: 'Retained Earnings', icon: '⚖️' },
  { code: '4900', name: 'Exchange Gain', icon: '💱' },
  { code: '5810', name: 'Fees', icon: '🏧' },
  { code: '5900', name: 'Exchange Loss', icon: '💱' },
];

/**
 * Replace the v1 accounting chart with Money Manager's defaults. Only called when no transaction exists.
 * System accounts keep their ids so nothing that references them breaks.
 */
export function seedMoneyManagerChart(db: Db, baseCurrency: string): void {
  const keep = MM_SYSTEM.map((s) => s.code);
  db.runSync('DELETE FROM payees', []);
  // Detach kept accounts from their v1 parents first (e.g. 5810 sat under 5800), or the delete breaks the FK.
  for (const s of MM_SYSTEM) {
    db.runSync('UPDATE accounts SET name = ?, icon = ?, parent_id = NULL, sort_order = 999 WHERE code = ?', [s.name, s.icon, s.code]);
  }
  db.runSync(`DELETE FROM accounts WHERE code NOT IN (${keep.map(() => '?').join(', ')})`, keep);
  const now = nowStamp();
  const idByCode = new Map<string, number>();
  MM_CHART.forEach((a, i) => {
    const parentId = a.parent ? idByCode.get(a.parent) ?? null : null;
    const g = a.group ? groupInfo(a.group) : null;
    const res = db.runSync(
      `INSERT INTO accounts (code, name, type, subtype, parent_id, currency, is_placeholder, icon, grp, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [a.code, a.name, a.type, g?.subtype ?? 'general', parentId, baseCurrency, a.icon, a.group ?? null, i, now]
    );
    idByCode.set(a.code, res.lastInsertRowId);
  });
}

/** Accounts the app relies on by code. They never appear as categories or in the Accounts tab. */
export const SYSTEM_CODES = {
  openingEquity: '3000',
  retainedEarnings: '3100',
  fxGain: '4900',
  fxLoss: '5900',
  bankCharges: '5810',
} as const;

const SYSTEM_CODE_SET = new Set<string>(Object.values(SYSTEM_CODES));

export function isSystemAccount(a: { code: string }): boolean {
  return SYSTEM_CODE_SET.has(a.code);
}

export function seedChartOfAccounts(db: Db, baseCurrency: string): void {
  const now = nowStamp();
  const idByCode = new Map<string, number>();
  for (const a of DEFAULT_CHART) {
    const parentId = a.parent ? idByCode.get(a.parent) ?? null : null;
    const res = db.runSync(
      `INSERT INTO accounts (code, name, type, subtype, parent_id, currency, is_placeholder, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.code, a.name, a.type, a.subtype ?? 'general', parentId, baseCurrency, a.placeholder ? 1 : 0, now]
    );
    idByCode.set(a.code, res.lastInsertRowId);
  }
}
