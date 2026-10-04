// Calculator keypad support: evaluate "12.50+3×2" style input without eval().

import { currencyDecimals } from './money';

export type CalcOp = '+' | '−' | '×' | '÷';
const OPS: Record<CalcOp, { prec: number; fn: (a: number, b: number) => number }> = {
  '+': { prec: 1, fn: (a, b) => a + b },
  '−': { prec: 1, fn: (a, b) => a - b },
  '×': { prec: 2, fn: (a, b) => a * b },
  '÷': { prec: 2, fn: (a, b) => a / b },
};

export function isOp(c: string): c is CalcOp {
  return c in OPS;
}

/** Evaluate left-to-right with × ÷ before + −. Returns null for incomplete or invalid input. */
export function evaluate(expr: string): number | null {
  const tokens = expr.replace(/,/g, '').match(/\d*\.?\d+|\d+\.|[+−×÷]/g);
  if (!tokens || tokens.join('') !== expr.replace(/,/g, '')) return null;
  const nums: number[] = [];
  const ops: CalcOp[] = [];
  const apply = () => {
    const b = nums.pop()!;
    const a = nums.pop()!;
    nums.push(OPS[ops.pop()!].fn(a, b));
  };
  let expectNumber = true;
  for (const t of tokens) {
    if (isOp(t)) {
      if (expectNumber) return null;
      while (ops.length && OPS[ops[ops.length - 1]].prec >= OPS[t].prec) apply();
      ops.push(t);
      expectNumber = true;
    } else {
      if (!expectNumber) return null;
      nums.push(Number(t));
      expectNumber = false;
    }
  }
  if (expectNumber) return null;
  while (ops.length) apply();
  const v = nums[0];
  return Number.isFinite(v) ? v : null;
}

export function hasOperator(expr: string): boolean {
  return /[+−×÷]/.test(expr.slice(1));
}

/** Apply one keypad press to the expression text. */
export function pressKey(expr: string, key: string, currency: string): string {
  const decimals = currencyDecimals(currency);
  if (key === '⌫') return expr.slice(0, -1);
  if (key === 'C') return '';
  if (key === '=') {
    const v = evaluate(expr);
    return v == null || v < 0 ? expr : toAmountText(v, decimals);
  }
  if (isOp(key)) {
    if (!expr) return expr;
    // Replace a trailing operator instead of stacking two.
    return isOp(expr.slice(-1)) ? expr.slice(0, -1) + key : expr + key;
  }
  const lastNumber = expr.split(/[+−×÷]/).pop() ?? '';
  if (key === '.') {
    if (decimals === 0 || lastNumber.includes('.')) return expr;
    return expr + (lastNumber === '' ? '0.' : '.');
  }
  // Digits: respect currency decimals and avoid leading zeros.
  const frac = lastNumber.split('.')[1];
  if (frac !== undefined && frac.length >= decimals) return expr;
  if (lastNumber === '0') return expr.slice(0, -1) + key;
  if (lastNumber.replace('.', '').length >= 12) return expr;
  return expr + key;
}

/** Round a calculator result to a plain decimal string with the given decimals (for parseMoney). */
export function toAmountText(value: number, decimals: number): string {
  // Trim float noise first (1.005 × 100 = 100.49999…) so halves round up as a person expects.
  const scaled = Number((value * 10 ** decimals).toFixed(6));
  return (Math.round(scaled) / 10 ** decimals).toFixed(decimals);
}
