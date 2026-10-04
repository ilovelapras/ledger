// Pure report builders. Inputs are accounts plus aggregated per-account totals
// from the database; outputs are display-ready rows. All amounts in base minor units.

import { buildTree, calculateBalance, flattenTree, ACCOUNT_TYPE_LABELS } from './accounting';
import type { Account, AccountTotals, AccountType } from './types';

export type TotalsMap = Map<number, AccountTotals>;

export function totalsMap(rows: AccountTotals[]): TotalsMap {
  return new Map(rows.map((r) => [r.account_id, r]));
}

export function balanceOf(account: Pick<Account, 'id' | 'type'>, totals: TotalsMap): number {
  const t = totals.get(account.id);
  return t ? calculateBalance(account.type, t.debit, t.credit) : 0;
}

/** Native-currency balance in the account's natural sign. */
export function nativeBalanceOf(account: Pick<Account, 'id' | 'type'>, totals: TotalsMap): number {
  const t = totals.get(account.id);
  if (!t) return 0;
  return account.type === 'asset' || account.type === 'expense' ? t.native : -t.native;
}

/** Income minus expenses for the given totals. */
export function netIncome(accounts: Account[], totals: TotalsMap): number {
  let net = 0;
  for (const a of accounts) {
    if (a.type === 'income') net += balanceOf(a, totals);
    else if (a.type === 'expense') net -= balanceOf(a, totals);
  }
  return net;
}

export interface StatementRow {
  key: string;
  label: string;
  code?: string;
  accountId?: number;
  depth: number;
  amount: number;
  compare?: number;
  isHeader: boolean;
}

export interface StatementSection {
  type: AccountType;
  title: string;
  rows: StatementRow[];
  total: number;
  compareTotal?: number;
}

function section(
  type: AccountType,
  accounts: Account[],
  totals: TotalsMap,
  compare?: TotalsMap,
  showZero = false
): StatementSection {
  const ofType = accounts.filter((a) => a.type === type);
  const tree = buildTree(ofType, (a) => balanceOf(a, totals));
  const compareTree = compare ? buildTree(ofType, (a) => balanceOf(a, compare)) : undefined;
  const compareTotals = new Map<number, number>();
  if (compareTree) for (const { node } of flattenTree(compareTree)) compareTotals.set(node.account.id, node.total);

  const rows: StatementRow[] = [];
  for (const { node, depth } of flattenTree(tree)) {
    const cmp = compareTotals.get(node.account.id) ?? 0;
    const hasChildren = node.children.length > 0;
    if (!showZero && node.total === 0 && cmp === 0) continue;
    rows.push({
      key: `a${node.account.id}`,
      label: node.account.name,
      code: node.account.code,
      accountId: node.account.id,
      depth,
      amount: hasChildren ? node.total : node.balance,
      compare: compare ? cmp : undefined,
      isHeader: hasChildren,
    });
  }
  const total = tree.reduce((s, n) => s + n.total, 0);
  const compareTotal = compareTree ? compareTree.reduce((s, n) => s + n.total, 0) : undefined;
  return { type, title: ACCOUNT_TYPE_LABELS[type], rows, total, compareTotal };
}

export interface BalanceSheet {
  asOf: string;
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  retainedEarnings: number;
  currentEarnings: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  /** Assets − (Liabilities + Equity). Always 0 for valid books. */
  difference: number;
}

/**
 * @param toDate    totals for all posted entries up to and including the as-of date
 * @param priorYears totals for entries before the start of the as-of date's financial year
 */
export function balanceSheet(
  asOf: string,
  accounts: Account[],
  toDate: TotalsMap,
  priorYears: TotalsMap
): BalanceSheet {
  const assets = section('asset', accounts, toDate);
  const liabilities = section('liability', accounts, toDate);
  const equity = section('equity', accounts, toDate);
  const retainedEarnings = netIncome(accounts, priorYears);
  const currentEarnings = netIncome(accounts, toDate) - retainedEarnings;
  const extra: StatementRow[] = [];
  if (retainedEarnings !== 0)
    extra.push({ key: 're', label: 'Retained earnings (prior years)', depth: 0, amount: retainedEarnings, isHeader: false });
  if (currentEarnings !== 0)
    extra.push({ key: 'cye', label: 'Current year earnings', depth: 0, amount: currentEarnings, isHeader: false });
  equity.rows.push(...extra);
  const totalEquity = equity.total + retainedEarnings + currentEarnings;
  equity.total = totalEquity;
  const totalLiabilitiesAndEquity = liabilities.total + totalEquity;
  return {
    asOf,
    assets,
    liabilities,
    equity,
    retainedEarnings,
    currentEarnings,
    totalEquity,
    totalLiabilitiesAndEquity,
    difference: assets.total - totalLiabilitiesAndEquity,
  };
}

export interface ProfitAndLoss {
  from: string;
  to: string;
  income: StatementSection;
  expenses: StatementSection;
  netIncome: number;
  compareNetIncome?: number;
}

export function profitAndLoss(
  from: string,
  to: string,
  accounts: Account[],
  period: TotalsMap,
  compare?: TotalsMap
): ProfitAndLoss {
  const income = section('income', accounts, period, compare);
  const expenses = section('expense', accounts, period, compare);
  return {
    from,
    to,
    income,
    expenses,
    netIncome: income.total - expenses.total,
    compareNetIncome:
      compare !== undefined ? (income.compareTotal ?? 0) - (expenses.compareTotal ?? 0) : undefined,
  };
}

export interface TrialBalanceRow {
  account: Account;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export function trialBalance(asOf: string, accounts: Account[], totals: TotalsMap): TrialBalance {
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const a of [...accounts].sort((x, y) => x.code.localeCompare(y.code))) {
    const t = totals.get(a.id);
    if (!t) continue;
    const net = t.debit - t.credit;
    if (net === 0) continue;
    const row = { account: a, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
    totalDebit += row.debit;
    totalCredit += row.credit;
    rows.push(row);
  }
  return { asOf, rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export interface LedgerLineIn {
  entry_id: number;
  transaction_id: number;
  date: string;
  reference: string;
  description: string;
  payee_name: string | null;
  memo: string | null;
  debit: number;
  credit: number;
  fx_amount: number;
  cleared: string;
}

export interface LedgerLine extends LedgerLineIn {
  /** Natural-sign running balance, base currency. */
  balance: number;
  /** Natural-sign running balance, account currency. */
  nativeBalance: number;
  /** Signed movement in account currency, natural sign. */
  nativeAmount: number;
}

export function runningLedger(
  account: Pick<Account, 'type'>,
  openingBase: number,
  openingNative: number,
  lines: LedgerLineIn[]
): LedgerLine[] {
  const debitNormal = account.type === 'asset' || account.type === 'expense';
  let balance = openingBase;
  let nativeBalance = openingNative;
  return lines.map((l) => {
    const signedBase = debitNormal ? l.debit - l.credit : l.credit - l.debit;
    const isDebit = l.debit > 0;
    const nativeAmount = (isDebit === debitNormal ? 1 : -1) * l.fx_amount;
    balance += signedBase;
    nativeBalance += nativeAmount;
    return { ...l, balance, nativeBalance, nativeAmount };
  });
}
