import { formatMoney, impliedRate, parseMoney, parseRate, toBase, toDecimalString } from '../money';

describe('parseMoney', () => {
  it('parses plain, grouped and signed amounts into cents', () => {
    expect(parseMoney('12', 'SGD')).toBe(1200);
    expect(parseMoney('1,234.5', 'SGD')).toBe(123450);
    expect(parseMoney('0.07', 'SGD')).toBe(7);
    expect(parseMoney('.5', 'SGD')).toBe(50);
    expect(parseMoney('-3.10', 'USD')).toBe(-310);
    expect(parseMoney('(3.10)', 'USD')).toBe(-310);
  });

  it('avoids floating point error', () => {
    // 1.005 * 100 = 100.49999999999999 in floating point.
    expect(parseMoney('1.005', 'BHD')).toBe(1005);
    expect(parseMoney('0.29', 'SGD')).toBe(29);
    expect(parseMoney('19.99', 'SGD')).toBe(1999);
  });

  it('respects currency decimals', () => {
    expect(parseMoney('1500', 'JPY')).toBe(1500);
    expect(parseMoney('1500.5', 'JPY')).toBeNull();
    expect(parseMoney('1.234', 'SGD')).toBeNull();
  });

  it('rejects junk', () => {
    expect(parseMoney('', 'SGD')).toBeNull();
    expect(parseMoney('abc', 'SGD')).toBeNull();
    expect(parseMoney('.', 'SGD')).toBeNull();
    expect(parseMoney('1.2.3', 'SGD')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats with grouping, code and accounting negatives', () => {
    expect(formatMoney(123456789, 'SGD')).toBe('SGD 1,234,567.89');
    expect(formatMoney(-5000, 'USD')).toBe('(USD 50.00)');
    expect(formatMoney(-5000, 'USD', { code: false, parens: false })).toBe('-50.00');
    expect(formatMoney(1500, 'JPY')).toBe('JPY 1,500');
    expect(toDecimalString(5, 'SGD')).toBe('0.05');
    expect(toDecimalString(-120, 'SGD')).toBe('-1.20');
  });
});

describe('fx', () => {
  it('converts foreign minor units to base minor units', () => {
    expect(toBase(10000, 'USD', '1.35', 'SGD')).toBe(13500);
    expect(toBase(1000, 'JPY', '0.0091', 'SGD')).toBe(910);
    expect(toBase(333, 'USD', '1.3333', 'SGD')).toBe(444);
    expect(toBase(500, 'SGD', '99', 'SGD')).toBe(500);
  });

  it('derives an implied rate', () => {
    expect(impliedRate(100000, 'USD', 135000, 'SGD')).toBe('1.35');
  });

  it('validates rates', () => {
    expect(parseRate('1.35')).toBe('1.35');
    expect(parseRate('0')).toBeNull();
    expect(parseRate('-1')).toBeNull();
    expect(parseRate('x')).toBeNull();
  });
});
