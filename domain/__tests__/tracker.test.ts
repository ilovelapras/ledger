import { budgetSummary } from '../budget';
import { evaluate, pressKey, toAmountText } from '../calc';
import { cardStatus, lastStatementClose, nextStatementClose, paymentDueAfter } from '../card';
import { calendarGrid, monthsIn, periodContaining, periodLabel, shiftPeriod, weeksIn } from '../periods';
import { dueOccurrences, occurrence, splitInstallments } from '../recurrence';

const cal = { monthStartDay: 1, weekStart: 0 as const };
const payday = { monthStartDay: 25, weekStart: 1 as const };

describe('periods', () => {
  it('calendar months', () => {
    expect(periodContaining('month', '2026-02-14', cal)).toEqual({ kind: 'month', from: '2026-02-01', to: '2026-02-28' });
    expect(periodLabel(periodContaining('month', '2026-02-14', cal), cal)).toBe('Feb 2026');
    expect(shiftPeriod(periodContaining('month', '2026-01-31', cal), 1, cal).to).toBe('2026-02-28');
  });

  it('payday months starting on the 25th', () => {
    expect(periodContaining('month', '2026-10-24', payday)).toEqual({ kind: 'month', from: '2026-09-25', to: '2026-10-24' });
    expect(periodContaining('month', '2026-10-25', payday).from).toBe('2026-10-25');
    expect(periodLabel(periodContaining('month', '2026-10-01', payday), payday)).toBe('Oct 2026');
    expect(periodContaining('year', '2026-01-10', payday)).toMatchObject({ from: '2025-01-25', to: '2026-01-24' });
  });

  it('weeks honour the week start', () => {
    // 2026-10-04 is a Sunday.
    expect(periodContaining('week', '2026-10-07', cal)).toMatchObject({ from: '2026-10-04', to: '2026-10-10' });
    expect(periodContaining('week', '2026-10-07', payday)).toMatchObject({ from: '2026-10-05', to: '2026-10-11' });
  });

  it('weeks and calendar grid cover the month exactly', () => {
    const oct = periodContaining('month', '2026-10-15', cal);
    const weeks = weeksIn(oct, cal);
    expect(weeks[0].from).toBe('2026-10-01');
    expect(weeks[weeks.length - 1].to).toBe('2026-10-31');
    const grid = calendarGrid(oct, cal);
    expect(grid.every((r) => r.length === 7)).toBe(true);
    expect(grid.flat().filter((d) => d.inPeriod)).toHaveLength(31);
    expect(monthsIn(periodContaining('year', '2026-06-01', cal), cal)).toHaveLength(12);
  });
});

describe('recurrence', () => {
  it('monthly from the 31st clamps without drifting', () => {
    expect([0, 1, 2, 3].map((i) => occurrence('2026-01-31', 'monthly', i))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('end of month, yearly leap day, biweekly', () => {
    expect(occurrence('2026-01-15', 'month_end', 1)).toBe('2026-02-28');
    expect(occurrence('2028-02-29', 'yearly', 1)).toBe('2029-02-28');
    expect(occurrence('2026-10-01', 'biweekly', 2)).toBe('2026-10-29');
  });

  it('lists only due occurrences up to today and the end date', () => {
    expect(dueOccurrences('2026-07-01', 'monthly', 1, '2026-10-04', null).map((o) => o.date)).toEqual([
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(dueOccurrences('2026-07-01', 'monthly', 1, '2026-10-04', '2026-08-15')).toHaveLength(1);
  });

  it('instalments sum exactly, remainder on the last', () => {
    expect(splitInstallments(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(splitInstallments(10000, 3).reduce((a, b) => a + b)).toBe(10000);
    expect(() => splitInstallments(100, 0)).toThrow();
  });
});

describe('credit card cycle', () => {
  it('finds statement and due dates', () => {
    expect(lastStatementClose('2026-10-04', 15)).toBe('2026-09-15');
    expect(lastStatementClose('2026-10-15', 15)).toBe('2026-10-15');
    expect(nextStatementClose('2026-10-04', 15)).toBe('2026-10-15');
    expect(lastStatementClose('2026-03-10', 31)).toBe('2026-02-28');
    expect(paymentDueAfter('2026-09-15', 5)).toBe('2026-10-05');
    expect(paymentDueAfter('2026-09-15', 25)).toBe('2026-09-25');
  });

  it('payable is the closed statement less payments since', () => {
    const s = cardStatus('2026-10-04', 15, 5, 50000, 20000, 80000);
    expect(s).toMatchObject({ payable: 30000, outstanding: 80000, dueDate: '2026-10-05' });
    expect(cardStatus('2026-10-04', 15, null, 50000, 60000, 10000).payable).toBe(0);
  });
});

describe('budget', () => {
  it('compares spending with budgets', () => {
    const s = budgetSummary(
      [
        { id: 1, name: 'Food', icon: null },
        { id: 2, name: 'Transport', icon: null },
        { id: 3, name: 'Gift', icon: null },
      ],
      new Map([
        [1, 45000],
        [3, 2000],
      ]),
      (id) => (id === 1 ? 40000 : id === 2 ? 10000 : 0)
    );
    expect(s.totalBudget).toBe(50000);
    expect(s.totalSpent).toBe(47000);
    expect(s.lines.find((l) => l.accountId === 1)).toMatchObject({ over: true, remaining: -5000 });
    expect(s.lines.find((l) => l.accountId === 3)).toMatchObject({ budget: 0, spent: 2000 });
  });
});

describe('calculator', () => {
  it('evaluates with precedence', () => {
    expect(evaluate('12.5+3×2')).toBe(18.5);
    expect(evaluate('100÷4−5')).toBe(20);
    expect(evaluate('7')).toBe(7);
    expect(evaluate('7+')).toBeNull();
    expect(evaluate('×7')).toBeNull();
    expect(evaluate('1÷0')).toBeNull();
  });

  it('keypad presses build valid amounts', () => {
    const type = (keys: string[], cur = 'SGD') => keys.reduce((e, k) => pressKey(e, k, cur), '');
    expect(type(['1', '2', '.', '5', '0', '9'])).toBe('12.50'); // third decimal ignored
    expect(type(['0', '7'])).toBe('7');
    expect(type(['.', '5'])).toBe('0.5');
    expect(type(['1', '0', '+', '×', '2'])).toBe('10×2'); // operator replaced
    expect(type(['1', '0', '0', '÷', '3', '='])).toBe('33.33');
    expect(type(['5', '.'], 'JPY')).toBe('5');
    expect(type(['9', '⌫', '4'])).toBe('4');
  });

  it('rounds results to currency decimals', () => {
    expect(toAmountText(10 / 3, 2)).toBe('3.33');
    expect(toAmountText(1.005, 2)).toBe('1.01');
    expect(toAmountText(1500.4, 0)).toBe('1500');
  });
});
