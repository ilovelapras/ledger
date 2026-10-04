export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface Account {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  parent_id: number | null;
  is_active: number;
  created_at: string;
  children?: Account[];
  balance?: number;
}

export interface Transaction {
  id: number;
  date: string;
  description: string;
  reference: string | null;
  created_at: string;
  entries?: Entry[];
}

export interface Entry {
  id: number;
  transaction_id: number;
  account_id: number;
  debit: number;
  credit: number;
  account?: Account;
}

export interface EntryInput {
  account_id: number;
  debit: number;
  credit: number;
}

export interface TransactionInput {
  date: string;
  description: string;
  reference: string | null;
  entries: EntryInput[];
}

export interface BalanceSheetData {
  assets: { account: Account; balance: number }[];
  liabilities: { account: Account; balance: number }[];
  equity: { account: Account; balance: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export interface ProfitLossData {
  income: { account: Account; balance: number }[];
  expenses: { account: Account; balance: number }[];
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
}

export interface TrialBalanceData {
  account: Account;
  debit: number;
  credit: number;
  balance: number;
}

export interface AccountBalance {
  account_id: number;
  balance: number;
}