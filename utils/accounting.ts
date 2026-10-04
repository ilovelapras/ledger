import type { AccountType } from '../types';

export function getNormalBalance(type: AccountType): 'debit' | 'credit' {
  return (type === 'asset' || type === 'expense') ? 'debit' : 'credit';
}

export function isDebitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}

export function calculateBalance(type: AccountType, totalDebit: number, totalCredit: number): number {
  return isDebitNormal(type) ? totalDebit - totalCredit : totalCredit - totalDebit;
}

export function getAccountTypeFromCode(code: string): AccountType | null {
  const firstDigit = code.charAt(0);
  switch (firstDigit) {
    case '1': return 'asset';
    case '2': return 'liability';
    case '3': return 'equity';
    case '4': return 'income';
    case '5': return 'expense';
    default: return null;
  }
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function parseAmount(value: string): number {
  const cleaned = value.replace(/[$,]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function validateTransactionBalance(entries: Array<{ debit: number; credit: number }>): boolean {
  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}

export function getAccountTypeLabel(type: AccountType): string {
  const labels: Record<AccountType, string> = {
    asset: 'Asset',
    liability: 'Liability',
    equity: 'Equity',
    income: 'Income',
    expense: 'Expense',
  };
  return labels[type];
}

export const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  asset: 'bg-green-100 text-green-800',
  liability: 'bg-red-100 text-red-800',
  equity: 'bg-purple-100 text-purple-800',
  income: 'bg-blue-100 text-blue-800',
  expense: 'bg-orange-100 text-orange-800',
};

export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  asset: '💰',
  liability: '💳',
  equity: '📊',
  income: '💵',
  expense: '💸',
};