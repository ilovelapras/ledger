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

/** Accounts the app relies on by code. */
export const SYSTEM_CODES = {
  openingEquity: '3000',
  retainedEarnings: '3100',
  fxGain: '4900',
  fxLoss: '5900',
  bankCharges: '5810',
} as const;

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
