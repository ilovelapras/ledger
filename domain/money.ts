// Integer minor-unit money helpers. Parsing never goes through floating point.

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG', 'XAF', 'XOF']);
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'JOD', 'TND']);

export function currencyDecimals(currency: string): number {
  if (ZERO_DECIMAL.has(currency)) return 0;
  if (THREE_DECIMAL.has(currency)) return 3;
  return 2;
}

/**
 * Parse user input like "1,234.5", "(12.30)", "-7" into minor units.
 * Returns null when the text is not a number or has more decimals than the currency allows.
 */
export function parseMoney(input: string, currency: string): number | null {
  let s = input.trim().replace(/[,\s]/g, '').replace(/^[A-Z]{3}/, '').replace(/^\$/, '');
  if (s === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === '' && (m[2] === undefined || m[2] === ''))) return null;
  const decimals = currencyDecimals(currency);
  const frac = m[2] ?? '';
  if (frac.length > decimals) return null;
  const whole = m[1] === '' ? 0 : Number(m[1]);
  const fracUnits = decimals === 0 ? 0 : Number(frac.padEnd(decimals, '0'));
  const value = whole * 10 ** decimals + fracUnits;
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

/** Minor units → plain decimal string without grouping, e.g. 123456 → "1234.56". Used to prefill inputs. */
export function toDecimalString(minor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  if (decimals === 0) return `${sign}${abs}`;
  const whole = Math.floor(abs / 10 ** decimals);
  const frac = String(abs % 10 ** decimals).padStart(decimals, '0');
  return `${sign}${whole}.${frac}`;
}

/** Grouped number without currency symbol: 123456 → "1,234.56". */
export function formatAmount(minor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  const [whole, frac] = toDecimalString(Math.abs(minor), currency).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = decimals === 0 ? grouped : `${grouped}.${frac}`;
  return minor < 0 ? `-${body}` : body;
}

/** Accounting style: negatives in parentheses, with the currency code. */
export function formatMoney(
  minor: number,
  currency: string,
  opts: { code?: boolean; parens?: boolean } = {}
): string {
  const { code = true, parens = true } = opts;
  const body = formatAmount(Math.abs(minor), currency);
  const withCode = code ? `${currency} ${body}` : body;
  if (minor < 0) return parens ? `(${withCode})` : `-${withCode}`;
  return withCode;
}

/** Validate an FX rate string: positive decimal. */
export function parseRate(input: string): string | null {
  const s = input.trim().replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.$/.test(s)) return null;
  const n = Number(s);
  if (!(n > 0) || !Number.isFinite(n)) return null;
  return String(n);
}

/**
 * Convert an amount in `currency` minor units to base minor units at `rate`
 * (base units per 1 unit of `currency`). Rounded half away from zero.
 */
export function toBase(
  amount: number,
  currency: string,
  rate: string,
  baseCurrency: string
): number {
  if (currency === baseCurrency) return amount;
  const units = amount / 10 ** currencyDecimals(currency);
  const base = units * Number(rate) * 10 ** currencyDecimals(baseCurrency);
  // Round to 6 significant decimals first to absorb float noise (e.g. 1.005 * 100).
  const cleaned = Number(base.toFixed(6));
  return Math.sign(cleaned) * Math.round(Math.abs(cleaned));
}

/** Rate implied by two amounts: base units per 1 foreign unit, 6 significant decimals. */
export function impliedRate(
  foreignAmount: number,
  currency: string,
  baseAmount: number,
  baseCurrency: string
): string {
  if (foreignAmount === 0) return '1';
  const f = foreignAmount / 10 ** currencyDecimals(currency);
  const b = baseAmount / 10 ** currencyDecimals(baseCurrency);
  return String(Number((b / f).toPrecision(10)));
}

export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'TWD', name: 'Taiwan Dollar' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'AED', name: 'UAE Dirham' },
];
