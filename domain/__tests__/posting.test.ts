import {
  buildJournal,
  buildOpeningBalance,
  buildPayment,
  buildReceipt,
  buildReversal,
  buildTransfer,
  PostingError,
  totals,
  validateEntries,
} from '../posting';
import type { Account } from '../types';

let nextId = 1;
function acc(type: Account['type'], currency = 'SGD', name = `${type}${nextId}`) {
  return { id: nextId++, type, currency, name };
}

const bank = acc('asset', 'SGD', 'DBS');
const usdBank = acc('asset', 'USD', 'USD Wallet');
const eurBank = acc('asset', 'EUR', 'EUR Wallet');
const card = acc('liability', 'SGD', 'Visa');
const groceries = acc('expense');
const dining = acc('expense');
const salary = acc('income');
const fees = acc('expense');
const fxGain = acc('income');
const fxLoss = acc('expense');
const obe = acc('equity');

function expectBalanced(entries: ReturnType<typeof buildPayment>) {
  expect(validateEntries(entries)).toBeNull();
  expect(totals(entries).difference).toBe(0);
}

describe('payment', () => {
  it('credits the bank and debits each split line', () => {
    const e = buildPayment({
      baseCurrency: 'SGD',
      money: bank,
      lines: [
        { account: groceries, amount: 4520 },
        { account: dining, amount: 1880 },
      ],
    });
    expectBalanced(e);
    expect(e[0]).toMatchObject({ account_id: bank.id, credit: 6400, debit: 0, fx_amount: 6400 });
    expect(e[1]).toMatchObject({ account_id: groceries.id, debit: 4520 });
  });

  it('a negative split line (discount/refund) flips side', () => {
    const e = buildPayment({
      baseCurrency: 'SGD',
      money: card,
      lines: [
        { account: groceries, amount: 5000 },
        { account: dining, amount: -1000 },
      ],
    });
    expectBalanced(e);
    expect(e.find((x) => x.account_id === dining.id)).toMatchObject({ credit: 1000, debit: 0 });
    expect(e[0]).toMatchObject({ credit: 4000 });
  });

  it('converts a foreign-currency payment at the given rate', () => {
    const e = buildPayment({
      baseCurrency: 'SGD',
      money: usdBank,
      rate: '1.35',
      lines: [{ account: dining, amount: 10000 }],
    });
    expectBalanced(e);
    expect(e[0]).toMatchObject({ currency: 'USD', fx_amount: 10000, credit: 13500, fx_rate: '1.35' });
    expect(e[1]).toMatchObject({ currency: 'SGD', fx_amount: 13500, debit: 13500, fx_rate: '1' });
  });

  it('needs a rate for foreign money accounts', () => {
    expect(() => buildPayment({ baseCurrency: 'SGD', money: usdBank, lines: [{ account: dining, amount: 1 }] })).toThrow(
      PostingError
    );
  });

  it('rejects a zero or negative total', () => {
    expect(() =>
      buildPayment({ baseCurrency: 'SGD', money: bank, lines: [{ account: dining, amount: -100 }] })
    ).toThrow(PostingError);
  });
});

describe('receipt', () => {
  it('debits the bank and credits income', () => {
    const e = buildReceipt({ baseCurrency: 'SGD', money: bank, lines: [{ account: salary, amount: 550000 }] });
    expectBalanced(e);
    expect(e[0]).toMatchObject({ account_id: bank.id, debit: 550000 });
    expect(e[1]).toMatchObject({ account_id: salary.id, credit: 550000 });
  });
});

describe('transfer', () => {
  const common = { baseCurrency: 'SGD', fxGainAccount: fxGain, fxLossAccount: fxLoss };

  it('same currency: one debit, one credit', () => {
    const e = buildTransfer({ ...common, from: bank, to: card, sent: 120000 });
    expectBalanced(e);
    expect(e).toHaveLength(2);
  });

  it('buying foreign currency: cost basis equals base paid, no FX line', () => {
    const e = buildTransfer({ ...common, from: bank, to: usdBank, sent: 135000, received: 100000 });
    expectBalanced(e);
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ account_id: usdBank.id, debit: 135000, fx_amount: 100000, fx_rate: '1.35' });
  });

  it('selling foreign currency above book rate books an exchange gain', () => {
    // Book rate 1.35, sold USD 1,000 for SGD 1,380.
    const e = buildTransfer({ ...common, from: usdBank, to: bank, sent: 100000, received: 138000, fromRate: '1.35' });
    expectBalanced(e);
    expect(e.find((x) => x.account_id === fxGain.id)).toMatchObject({ credit: 3000 });
  });

  it('selling foreign currency below book rate books an exchange loss', () => {
    const e = buildTransfer({ ...common, from: usdBank, to: bank, sent: 100000, received: 132000, fromRate: '1.35' });
    expectBalanced(e);
    expect(e.find((x) => x.account_id === fxLoss.id)).toMatchObject({ debit: 3000 });
  });

  it('foreign to different foreign uses both rates', () => {
    const e = buildTransfer({
      ...common,
      from: usdBank,
      to: eurBank,
      sent: 100000,
      received: 90000,
      fromRate: '1.35',
      toRate: '1.47',
    });
    expectBalanced(e);
    // 900 EUR * 1.47 = 1323 SGD vs 1350 SGD book → 27 loss
    expect(e.find((x) => x.account_id === fxLoss.id)).toMatchObject({ debit: 2700 });
  });

  it('adds a transfer fee charged to the source account', () => {
    const e = buildTransfer({ ...common, from: bank, to: card, sent: 50000, fee: 500, feeAccount: fees });
    expectBalanced(e);
    expect(e.find((x) => x.account_id === fees.id)).toMatchObject({ debit: 500 });
    const fromCredits = e.filter((x) => x.account_id === bank.id).reduce((s, x) => s + x.credit, 0);
    expect(fromCredits).toBe(50500);
  });

  it('rejects same account', () => {
    expect(() => buildTransfer({ ...common, from: bank, to: bank, sent: 1 })).toThrow(PostingError);
  });
});

describe('journal, opening, reversal', () => {
  it('journal lines convert foreign accounts', () => {
    const e = buildJournal('SGD', [
      { account: usdBank, side: 'dr', amount: 10000, rate: '1.35' },
      { account: obe, side: 'cr', amount: 13500 },
    ]);
    expectBalanced(e);
  });

  it('opening balance for an asset debits it against equity', () => {
    const e = buildOpeningBalance({ baseCurrency: 'SGD', account: bank, amount: 1000000, openingEquity: obe });
    expectBalanced(e);
    expect(e[0]).toMatchObject({ account_id: bank.id, debit: 1000000 });
    expect(e[1]).toMatchObject({ account_id: obe.id, credit: 1000000 });
  });

  it('opening balance for a liability credits it', () => {
    const e = buildOpeningBalance({ baseCurrency: 'SGD', account: card, amount: 25000, openingEquity: obe });
    expect(e[0]).toMatchObject({ account_id: card.id, credit: 25000 });
  });

  it('reversal mirrors every line and nets to zero', () => {
    const e = buildPayment({ baseCurrency: 'SGD', money: bank, lines: [{ account: groceries, amount: 999 }] });
    const r = buildReversal(e);
    expectBalanced(r);
    const net = new Map<number, number>();
    for (const x of [...e, ...r]) net.set(x.account_id, (net.get(x.account_id) ?? 0) + x.debit - x.credit);
    expect([...net.values()].every((v) => v === 0)).toBe(true);
  });
});
