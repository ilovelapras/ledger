// Money Manager colour language: income blue, expense red, transfers neutral.
export const MM = {
  income: '#1d6fe0',
  expense: '#e5484d',
  transfer: '#4b5563',
  accent: '#e5484d',
  muted: '#6b7280',
  border: '#e5e7eb',
  bg: '#f5f5f7',
} as const;

export const kindColor = (kind: string) =>
  kind === 'receipt' ? MM.income : kind === 'payment' ? MM.expense : MM.transfer;

export const incomeText = 'text-[#1d6fe0]';
export const expenseText = 'text-[#e5484d]';
