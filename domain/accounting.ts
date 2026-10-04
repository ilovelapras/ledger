import type { Account, AccountSubtype, AccountType, TxKind } from './types';

export function isDebitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}

export function getNormalBalance(type: AccountType): 'debit' | 'credit' {
  return isDebitNormal(type) ? 'debit' : 'credit';
}

/** Balance in the account's natural sign: positive means a normal balance. */
export function calculateBalance(type: AccountType, totalDebit: number, totalCredit: number): number {
  return isDebitNormal(type) ? totalDebit - totalCredit : totalCredit - totalDebit;
}

/** Convert a signed debit-positive amount to the account's natural sign. */
export function naturalSign(type: AccountType, debitPositive: number): number {
  return isDebitNormal(type) ? debitPositive : -debitPositive;
}

export function getAccountTypeFromCode(code: string): AccountType | null {
  switch (code.charAt(0)) {
    case '1': return 'asset';
    case '2': return 'liability';
    case '3': return 'equity';
    case '4': return 'income';
    case '5': return 'expense';
    default: return null;
  }
}

export function isBalanceSheetType(type: AccountType): boolean {
  return type === 'asset' || type === 'liability' || type === 'equity';
}

/**
 * Accounts that hold money (Money Manager's "Accounts": cash, bank, cards, loans…) and can be the
 * "from"/"into" side of income, expenses and transfers.
 */
export function isMoneyAccount(a: Pick<Account, 'type' | 'is_placeholder'>): boolean {
  return (a.type === 'asset' || a.type === 'liability') && !a.is_placeholder;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
};

export const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense'];

export const SUBTYPE_LABELS: Record<AccountSubtype, string> = {
  bank: 'Bank account',
  cash: 'Cash',
  credit_card: 'Credit card',
  loan: 'Loan',
  investment: 'Investment',
  receivable: 'Receivable',
  payable: 'Payable',
  property: 'Property / vehicle',
  general: 'General',
};

export const SUBTYPES_BY_TYPE: Record<AccountType, AccountSubtype[]> = {
  asset: ['bank', 'cash', 'investment', 'receivable', 'property', 'general'],
  liability: ['credit_card', 'loan', 'payable', 'general'],
  equity: ['general'],
  income: ['general'],
  expense: ['general'],
};

export const KIND_LABELS: Record<TxKind, string> = {
  payment: 'Payment',
  receipt: 'Receipt',
  transfer: 'Transfer',
  journal: 'Journal',
  opening: 'Opening balance',
  reversal: 'Reversal',
};

export const KIND_PREFIX: Record<TxKind, string> = {
  payment: 'PAY',
  receipt: 'RCT',
  transfer: 'TRF',
  journal: 'JNL',
  opening: 'OPB',
  reversal: 'REV',
};

export interface AccountNode<T extends Account = Account> {
  account: T;
  children: AccountNode<T>[];
  /** Own balance (natural sign, base units). */
  balance: number;
  /** Own + all descendants. */
  total: number;
}

/** Build a code-ordered tree and roll balances up to parents. */
export function buildTree<T extends Account>(
  accounts: T[],
  balanceOf: (a: T) => number = () => 0
): AccountNode<T>[] {
  const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  const map = new Map<number, AccountNode<T>>();
  for (const a of sorted) {
    map.set(a.id, { account: a, children: [], balance: balanceOf(a), total: 0 });
  }
  const roots: AccountNode<T>[] = [];
  for (const a of sorted) {
    const node = map.get(a.id)!;
    const parent = a.parent_id != null ? map.get(a.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const roll = (n: AccountNode<T>): number => {
    n.total = n.balance + n.children.reduce((s, c) => s + roll(c), 0);
    return n.total;
  };
  roots.forEach(roll);
  return roots;
}

/** Depth-first flatten with depth info, for rendering indented lists. */
export function flattenTree<T extends Account>(
  nodes: AccountNode<T>[],
  depth = 0,
  out: { node: AccountNode<T>; depth: number }[] = []
): { node: AccountNode<T>; depth: number }[] {
  for (const n of nodes) {
    out.push({ node: n, depth });
    flattenTree(n.children, depth + 1, out);
  }
  return out;
}

/** Full display path, e.g. "Bank Accounts › DBS Savings". */
export function accountPath(account: Account, byId: Map<number, Account>): string {
  const parts = [account.name];
  let p = account.parent_id != null ? byId.get(account.parent_id) : undefined;
  let guard = 0;
  while (p && guard++ < 10) {
    parts.unshift(p.name);
    p = p.parent_id != null ? byId.get(p.parent_id) : undefined;
  }
  return parts.join(' › ');
}
