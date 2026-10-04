// Bridges the entry form (strings the user typed) and posted entry lines.

import { currencyDecimals, parseMoney, parseRate, toDecimalString } from './money';
import {
  buildJournal,
  buildPayment,
  buildReceipt,
  buildTransfer,
  PostingError,
  type CategoryLine,
  type JournalLine,
} from './posting';
import type { Account, EntryInput, TxKind } from './types';

export type FormMode = 'payment' | 'receipt' | 'transfer' | 'journal';

export interface FormLine {
  accountId: number | null;
  amount: string;
  side: 'dr' | 'cr';
  rate: string;
  memo: string;
}

export interface TxFormValues {
  mode: FormMode;
  date: string;
  reference: string;
  payeeName: string;
  description: string;
  memo: string;
  // payment / receipt
  moneyAccountId: number | null;
  rate: string;
  lines: FormLine[];
  // transfer
  fromId: number | null;
  toId: number | null;
  sent: string;
  received: string;
  fromRate: string;
  toRate: string;
  fee: string;
}

export interface FormContext {
  baseCurrency: string;
  accounts: Map<number, Account>;
  fxGain: Account;
  fxLoss: Account;
  bankCharges: Account;
}

export function emptyLine(side: 'dr' | 'cr' = 'dr'): FormLine {
  return { accountId: null, amount: '', side, rate: '', memo: '' };
}

export function emptyForm(mode: FormMode, date: string): TxFormValues {
  return {
    mode,
    date,
    reference: '',
    payeeName: '',
    description: '',
    memo: '',
    moneyAccountId: null,
    rate: '',
    lines: mode === 'journal' ? [emptyLine('dr'), emptyLine('cr')] : [emptyLine()],
    fromId: null,
    toId: null,
    sent: '',
    received: '',
    fromRate: '',
    toRate: '',
    fee: '',
  };
}

export const MODE_TO_KIND: Record<FormMode, TxKind> = {
  payment: 'payment',
  receipt: 'receipt',
  transfer: 'transfer',
  journal: 'journal',
};

function account(ctx: FormContext, id: number | null, what: string): Account {
  const a = id != null ? ctx.accounts.get(id) : undefined;
  if (!a) throw new PostingError(`Choose ${what}.`);
  return a;
}

function money(text: string, currency: string, what: string, required = true): number {
  if (!text.trim()) {
    if (required) throw new PostingError(`Enter ${what}.`);
    return 0;
  }
  const v = parseMoney(text, currency);
  if (v == null) throw new PostingError(`${what[0].toUpperCase()}${what.slice(1)} is not a valid ${currency} amount.`);
  return v;
}

function rate(text: string, needed: boolean, label: string): string | undefined {
  if (!needed) return undefined;
  const r = parseRate(text);
  if (!r) throw new PostingError(`Enter the ${label} exchange rate.`);
  return r;
}

/** Throws PostingError with a user-facing message when the form is incomplete. */
export function formToEntries(v: TxFormValues, ctx: FormContext): EntryInput[] {
  const base = ctx.baseCurrency;
  switch (v.mode) {
    case 'payment':
    case 'receipt': {
      const m = account(ctx, v.moneyAccountId, v.mode === 'payment' ? 'the account paid from' : 'the account paid into');
      const lines: CategoryLine[] = v.lines
        .filter((l) => l.accountId != null || l.amount.trim())
        .map((l, i) => ({
          account: account(ctx, l.accountId, `an account for line ${i + 1}`),
          amount: money(l.amount, m.currency, `an amount for line ${i + 1}`),
          memo: l.memo,
        }));
      if (lines.length === 0) throw new PostingError('Add at least one line.');
      const input = {
        baseCurrency: base,
        money: m,
        rate: rate(v.rate, m.currency !== base, `${m.currency} → ${base}`),
        lines,
      };
      return v.mode === 'payment' ? buildPayment(input) : buildReceipt(input);
    }
    case 'transfer': {
      const from = account(ctx, v.fromId, 'the account to transfer from');
      const to = account(ctx, v.toId, 'the account to transfer to');
      const sent = money(v.sent, from.currency, 'the amount sent');
      const crossCurrency = from.currency !== to.currency;
      const received = crossCurrency ? money(v.received, to.currency, 'the amount received') : undefined;
      const fee = money(v.fee, from.currency, 'the fee', false);
      return buildTransfer({
        baseCurrency: base,
        from,
        to,
        sent,
        received,
        fromRate: rate(v.fromRate, from.currency !== base, `${from.currency} → ${base}`),
        toRate: rate(v.toRate, crossCurrency && from.currency !== base && to.currency !== base, `${to.currency} → ${base}`),
        fee: fee || undefined,
        feeAccount: fee ? ctx.bankCharges : undefined,
        fxGainAccount: ctx.fxGain,
        fxLossAccount: ctx.fxLoss,
        memo: v.memo,
      });
    }
    case 'journal': {
      const lines: JournalLine[] = v.lines
        .filter((l) => l.accountId != null || l.amount.trim())
        .map((l, i) => {
          const a = account(ctx, l.accountId, `an account for line ${i + 1}`);
          return {
            account: a,
            side: l.side,
            amount: money(l.amount, a.currency, `an amount for line ${i + 1}`),
            rate: rate(l.rate, a.currency !== base, `${a.currency} rate on line ${i + 1}`),
            memo: l.memo,
          };
        });
      return buildJournal(base, lines);
    }
  }
}

function sameEntries(a: EntryInput[], b: EntryInput[]): boolean {
  const key = (e: EntryInput) => `${e.account_id}:${e.debit}:${e.credit}:${e.fx_amount}`;
  const ka = a.map(key).sort();
  const kb = b.map(key).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/**
 * Rebuild form values from stored lines. Tries the friendly layout for the transaction's kind
 * and falls back to journal lines whenever the friendly form would not reproduce the entries exactly.
 */
export function entriesToForm(
  tx: { kind: TxKind; date: string; reference: string; description: string; memo: string | null; payeeName: string; entries: EntryInput[] },
  ctx: FormContext
): TxFormValues {
  const base = ctx.baseCurrency;
  const common = {
    date: tx.date,
    reference: tx.reference,
    payeeName: tx.payeeName,
    description: tx.description,
    memo: tx.memo ?? '',
  };
  const cur = (id: number) => ctx.accounts.get(id)?.currency ?? base;
  const attempt = (v: TxFormValues): TxFormValues | null => {
    try {
      return sameEntries(formToEntries(v, ctx), tx.entries) ? v : null;
    } catch {
      return null;
    }
  };

  const e = tx.entries;
  if ((tx.kind === 'payment' || tx.kind === 'receipt') && e.length >= 2) {
    const m = e[0];
    const mCur = cur(m.account_id);
    const moneySide = tx.kind === 'payment' ? 'credit' : 'debit';
    const toMoneyCurrency = (x: EntryInput) => {
      if (cur(x.account_id) === mCur) return x.fx_amount;
      // Category in base while money is foreign: back out the money-currency amount.
      const r = Number(m.fx_rate) || 1;
      const baseUnits = (x.debit + x.credit) / 10 ** currencyDecimals(base);
      return Math.round((baseUnits / r) * 10 ** currencyDecimals(mCur));
    };
    const v = attempt({
      ...emptyForm(tx.kind, tx.date),
      ...common,
      moneyAccountId: m.account_id,
      rate: mCur !== base ? m.fx_rate : '',
      lines: e.slice(1).map((x) => {
        const sameSideAsMoney = (moneySide === 'credit' ? x.credit : x.debit) > 0;
        const amt = toMoneyCurrency(x) * (sameSideAsMoney ? -1 : 1);
        return { ...emptyLine(), accountId: x.account_id, amount: toDecimalString(amt, mCur), memo: x.memo ?? '' };
      }),
    });
    if (v) return v;
  }

  if (tx.kind === 'transfer' && e.length >= 2) {
    const to = e[0];
    const from = e[1];
    const feeLine = e.find((x, i) => i > 1 && x.account_id === from.account_id && x.credit > 0);
    const fromCur = cur(from.account_id);
    const toCur = cur(to.account_id);
    const v = attempt({
      ...emptyForm('transfer', tx.date),
      ...common,
      fromId: from.account_id,
      toId: to.account_id,
      sent: toDecimalString(from.fx_amount, fromCur),
      received: fromCur !== toCur ? toDecimalString(to.fx_amount, toCur) : '',
      fromRate: fromCur !== base ? from.fx_rate : '',
      toRate: toCur !== base ? to.fx_rate : '',
      fee: feeLine ? toDecimalString(feeLine.fx_amount, fromCur) : '',
    });
    if (v) return v;
  }

  return {
    ...emptyForm('journal', tx.date),
    ...common,
    lines: e.map((x) => ({
      accountId: x.account_id,
      side: x.debit > 0 ? 'dr' : 'cr',
      amount: toDecimalString(x.fx_amount, cur(x.account_id)),
      rate: cur(x.account_id) !== base ? x.fx_rate : '',
      memo: x.memo ?? '',
    })),
  };
}
