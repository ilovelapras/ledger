// Turn the simple entry forms (payment, receipt, transfer, journal, opening balance)
// into balanced double-entry lines. All amounts are integer minor units.

import { impliedRate, toBase } from './money';
import { isDebitNormal } from './accounting';
import type { Account, EntryInput } from './types';

type Acc = Pick<Account, 'id' | 'currency' | 'type' | 'name'>;

export class PostingError extends Error {}

function line(
  account: Acc,
  side: 'dr' | 'cr',
  base: number,
  fxAmount: number,
  rate: string,
  memo?: string | null
): EntryInput {
  // Negative amounts flip to the other side so every stored line is positive.
  if (base < 0 || (base === 0 && fxAmount < 0)) {
    side = side === 'dr' ? 'cr' : 'dr';
    base = -base;
    fxAmount = -fxAmount;
  }
  return {
    account_id: account.id,
    debit: side === 'dr' ? base : 0,
    credit: side === 'cr' ? base : 0,
    currency: account.currency,
    fx_amount: Math.abs(fxAmount),
    fx_rate: rate,
    memo: memo ?? null,
  };
}

export interface CategoryLine {
  account: Acc;
  /** In the money account's currency. May be negative (e.g. a discount line). */
  amount: number;
  memo?: string | null;
}

export interface MoneyMovementInput {
  baseCurrency: string;
  /** Bank / cash / card the money leaves (payment) or arrives in (receipt). */
  money: Acc;
  /** Base units per 1 unit of the money account's currency. Ignored when it is the base currency. */
  rate?: string;
  lines: CategoryLine[];
}

function moneyMovement(input: MoneyMovementInput, direction: 'out' | 'in'): EntryInput[] {
  const { baseCurrency, money, lines } = input;
  if (lines.length === 0) throw new PostingError('Add at least one line.');
  const foreign = money.currency !== baseCurrency;
  const rate = foreign ? input.rate : '1';
  if (!rate) throw new PostingError(`Enter the ${money.currency} → ${baseCurrency} exchange rate.`);

  const catSide = direction === 'out' ? 'dr' : 'cr';
  const moneySide = direction === 'out' ? 'cr' : 'dr';
  const entries: EntryInput[] = [];
  let totalNative = 0;
  let totalBase = 0;

  for (const l of lines) {
    if (l.amount === 0) continue;
    if (l.account.id === money.id) throw new PostingError(`"${money.name}" can't be both sides of the entry.`);
    if (l.account.currency !== baseCurrency && l.account.currency !== money.currency) {
      throw new PostingError(
        `"${l.account.name}" is in ${l.account.currency}; record a transfer instead.`
      );
    }
    const base = toBase(l.amount, money.currency, rate, baseCurrency);
    const catNative = l.account.currency === money.currency ? l.amount : base;
    const catRate = l.account.currency === baseCurrency ? '1' : rate;
    entries.push(line(l.account, catSide, base, catNative, catRate, l.memo));
    totalNative += l.amount;
    totalBase += base;
  }
  if (totalNative <= 0) throw new PostingError('The total must be more than zero.');
  entries.unshift(line(money, moneySide, totalBase, totalNative, rate));
  return entries;
}

/** Money out: Dr each category line, Cr the bank/card. */
export function buildPayment(input: MoneyMovementInput): EntryInput[] {
  return moneyMovement(input, 'out');
}

/** Money in: Dr the bank, Cr each income (or other) line. */
export function buildReceipt(input: MoneyMovementInput): EntryInput[] {
  return moneyMovement(input, 'in');
}

export interface TransferInput {
  baseCurrency: string;
  from: Acc;
  to: Acc;
  /** Amount leaving `from`, in from's currency. */
  sent: number;
  /** Amount arriving in `to`, in to's currency. Ignored when both share a currency. */
  received?: number;
  /** from-currency → base rate. Defaults to the account's book rate in the UI. */
  fromRate?: string;
  /** to-currency → base rate. Only needed when both sides are foreign and differ. */
  toRate?: string;
  /** Optional bank fee charged to `from`, in from's currency. */
  fee?: number;
  feeAccount?: Acc;
  fxGainAccount: Acc;
  fxLossAccount: Acc;
  memo?: string | null;
}

/**
 * Dr `to`, Cr `from`. When value is lost or gained crossing currencies
 * (selling foreign currency at a rate different from its book rate),
 * the difference posts to FX gain/loss so the books still balance.
 */
export function buildTransfer(t: TransferInput): EntryInput[] {
  const { baseCurrency: base, from, to } = t;
  if (from.id === to.id) throw new PostingError('Choose two different accounts.');
  if (!(t.sent > 0)) throw new PostingError('Enter the amount sent.');

  const fromForeign = from.currency !== base;
  const toForeign = to.currency !== base;
  if (fromForeign && !t.fromRate) throw new PostingError(`Enter the ${from.currency} → ${base} rate.`);
  const fromRate = fromForeign ? t.fromRate! : '1';
  const fromBase = toBase(t.sent, from.currency, fromRate, base);

  let received: number;
  let toBaseAmt: number;
  if (to.currency === from.currency) {
    received = t.sent;
    toBaseAmt = fromBase;
  } else {
    if (!(t.received && t.received > 0)) throw new PostingError(`Enter the amount received in ${to.currency}.`);
    received = t.received;
    if (!toForeign) {
      toBaseAmt = received;
    } else if (!fromForeign) {
      // Buying foreign currency: its cost in base is what was paid.
      toBaseAmt = fromBase;
    } else {
      if (!t.toRate) throw new PostingError(`Enter the ${to.currency} → ${base} rate.`);
      toBaseAmt = toBase(received, to.currency, t.toRate, base);
    }
  }
  const toRate = toForeign ? impliedRate(received, to.currency, toBaseAmt, base) : '1';

  const entries: EntryInput[] = [
    line(to, 'dr', toBaseAmt, received, toRate, t.memo),
    line(from, 'cr', fromBase, t.sent, fromRate, t.memo),
  ];

  const diff = toBaseAmt - fromBase;
  if (diff > 0) entries.push(line(t.fxGainAccount, 'cr', diff, diff, '1', 'Exchange gain'));
  if (diff < 0) entries.push(line(t.fxLossAccount, 'dr', -diff, -diff, '1', 'Exchange loss'));

  if (t.fee && t.fee > 0) {
    if (!t.feeAccount) throw new PostingError('Choose an account for the fee.');
    const feeBase = toBase(t.fee, from.currency, fromRate, base);
    entries.push(line(t.feeAccount, 'dr', feeBase, t.feeAccount.currency === base ? feeBase : t.fee, t.feeAccount.currency === base ? '1' : fromRate, 'Transfer fee'));
    entries.push(line(from, 'cr', feeBase, t.fee, fromRate, 'Transfer fee'));
  }
  return entries;
}

export interface JournalLine {
  account: Acc;
  side: 'dr' | 'cr';
  /** In the account's own currency. */
  amount: number;
  /** Required for foreign-currency accounts. */
  rate?: string;
  memo?: string | null;
}

export function buildJournal(baseCurrency: string, lines: JournalLine[]): EntryInput[] {
  return lines
    .filter((l) => l.amount !== 0)
    .map((l) => {
      const foreign = l.account.currency !== baseCurrency;
      if (foreign && !l.rate) throw new PostingError(`Enter the ${l.account.currency} rate for "${l.account.name}".`);
      const rate = foreign ? l.rate! : '1';
      return line(l.account, l.side, toBase(l.amount, l.account.currency, rate, baseCurrency), l.amount, rate, l.memo);
    });
}

export interface OpeningInput {
  baseCurrency: string;
  account: Acc;
  /** Natural-sign balance in the account's currency: positive = money you have (asset) or owe (liability). */
  amount: number;
  rate?: string;
  openingEquity: Acc;
}

export function buildOpeningBalance(o: OpeningInput): EntryInput[] {
  if (o.amount === 0) throw new PostingError('Enter a non-zero balance.');
  const foreign = o.account.currency !== o.baseCurrency;
  if (foreign && !o.rate) throw new PostingError(`Enter the ${o.account.currency} → ${o.baseCurrency} rate.`);
  const rate = foreign ? o.rate! : '1';
  const base = toBase(o.amount, o.account.currency, rate, o.baseCurrency);
  const side = isDebitNormal(o.account.type) ? 'dr' : 'cr';
  const other = side === 'dr' ? 'cr' : 'dr';
  return [
    line(o.account, side, base, o.amount, rate),
    line(o.openingEquity, other, base, base, '1'),
  ];
}

/** Mirror image of a transaction's lines. */
export function buildReversal(entries: EntryInput[]): EntryInput[] {
  return entries.map((e) => ({ ...e, debit: e.credit, credit: e.debit }));
}

export function totals(entries: Pick<EntryInput, 'debit' | 'credit'>[]) {
  let debit = 0;
  let credit = 0;
  for (const e of entries) {
    debit += e.debit;
    credit += e.credit;
  }
  return { debit, credit, difference: debit - credit };
}

/** Returns an error message, or null when the entries form a valid balanced transaction. */
export function validateEntries(entries: EntryInput[]): string | null {
  if (entries.length < 2) return 'A transaction needs at least two lines.';
  for (const e of entries) {
    if (!Number.isSafeInteger(e.debit) || !Number.isSafeInteger(e.credit)) return 'Amounts must be whole cents.';
    if (e.debit < 0 || e.credit < 0) return 'Amounts cannot be negative.';
    if ((e.debit > 0) === (e.credit > 0)) return 'Each line must be either a debit or a credit.';
    if (!(e.fx_amount > 0)) return 'Each line needs an amount.';
  }
  const t = totals(entries);
  if (t.difference !== 0) return 'Debits and credits do not balance.';
  return null;
}
