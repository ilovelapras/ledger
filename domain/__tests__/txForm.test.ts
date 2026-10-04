import { totals } from '../posting';
import { emptyForm, entriesToForm, formToEntries, type FormContext, type TxFormValues } from '../txForm';
import type { Account } from '../types';

function mk(id: number, code: string, name: string, type: Account['type'], currency = 'SGD'): Account {
  return {
    id, code, name, type, currency, subtype: 'general', parent_id: null, is_placeholder: 0,
    institution: null, account_no: null, notes: null, is_active: 1, created_at: '',
    icon: null, grp: null, sort_order: 0, statement_day: null, payment_day: null, payment_account_id: null, include_in_totals: 1,
  };
}

const list = [
  mk(1, '1100', 'DBS', 'asset'),
  mk(2, '1120', 'USD Wallet', 'asset', 'USD'),
  mk(3, '2010', 'Visa', 'liability'),
  mk(4, '5110', 'Groceries', 'expense'),
  mk(5, '5120', 'Dining', 'expense'),
  mk(6, '4010', 'Salary', 'income'),
  mk(7, '4900', 'FX gain', 'income'),
  mk(8, '5900', 'FX loss', 'expense'),
  mk(9, '5810', 'Bank charges', 'expense'),
];
const ctx: FormContext = {
  baseCurrency: 'SGD',
  accounts: new Map(list.map((a) => [a.id, a])),
  fxGain: list[6],
  fxLoss: list[7],
  bankCharges: list[8],
};

function roundTrip(v: TxFormValues, kind: 'payment' | 'receipt' | 'transfer' | 'journal') {
  const entries = formToEntries(v, ctx);
  expect(totals(entries).difference).toBe(0);
  const back = entriesToForm(
    { kind, date: v.date, reference: 'X', description: '', memo: null, payeeName: '', entries },
    ctx
  );
  expect(back.mode).toBe(v.mode);
  expect(formToEntries(back, ctx)).toEqual(entries);
  return back;
}

describe('transaction form', () => {
  it('payment with splits and a discount round-trips', () => {
    const v = {
      ...emptyForm('payment', '2026-02-01'),
      moneyAccountId: 3,
      lines: [
        { accountId: 4, amount: '45.20', side: 'dr' as const, rate: '', memo: 'veg' },
        { accountId: 5, amount: '-5', side: 'dr' as const, rate: '', memo: '' },
      ],
    };
    const back = roundTrip(v, 'payment');
    expect(back.lines.map((l) => l.amount)).toEqual(['45.20', '-5.00']);
  });

  it('foreign-currency payment round-trips', () => {
    roundTrip(
      { ...emptyForm('payment', '2026-02-01'), moneyAccountId: 2, rate: '1.3412', lines: [{ accountId: 5, amount: '87.65', side: 'dr', rate: '', memo: '' }] },
      'payment'
    );
  });

  it('transfer with fee and currency conversion round-trips', () => {
    roundTrip(
      { ...emptyForm('transfer', '2026-02-01'), fromId: 2, toId: 1, sent: '1000', received: '1380', fromRate: '1.35', fee: '5' },
      'transfer'
    );
  });

  it('journal round-trips', () => {
    roundTrip(
      {
        ...emptyForm('journal', '2026-02-01'),
        lines: [
          { accountId: 4, amount: '10', side: 'dr', rate: '', memo: '' },
          { accountId: 1, amount: '10', side: 'cr', rate: '', memo: '' },
        ],
      },
      'journal'
    );
  });

  it('gives a clear message for incomplete forms', () => {
    expect(() => formToEntries(emptyForm('payment', '2026-02-01'), ctx)).toThrow('Choose the account paid from.');
    expect(() =>
      formToEntries({ ...emptyForm('payment', '2026-02-01'), moneyAccountId: 2, lines: [{ accountId: 4, amount: '1', side: 'dr', rate: '', memo: '' }] }, ctx)
    ).toThrow(/exchange rate/);
    expect(() =>
      formToEntries({ ...emptyForm('receipt', '2026-02-01'), moneyAccountId: 1, lines: [{ accountId: 6, amount: '1.234', side: 'dr', rate: '', memo: '' }] }, ctx)
    ).toThrow(/not a valid SGD amount/);
  });
});
