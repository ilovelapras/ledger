// Money is always an integer number of minor units (cents) — never a float.

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export type AccountSubtype =
  | 'bank'
  | 'cash'
  | 'credit_card'
  | 'loan'
  | 'investment'
  | 'receivable'
  | 'payable'
  | 'property'
  | 'general';

export interface Account {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  parent_id: number | null;
  /** ISO currency code the account is held in. Income/expense/equity accounts are always base. */
  currency: string;
  /** Header accounts group others and cannot be posted to. */
  is_placeholder: number;
  institution: string | null;
  account_no: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  /** Emoji shown for categories and accounts. */
  icon: string | null;
  /** Money Manager account group (cash, accounts, card, …); null for categories. */
  grp: string | null;
  sort_order: number;
  /** Credit cards: day of month the statement closes / payment is due. */
  statement_day: number | null;
  payment_day: number | null;
  payment_account_id: number | null;
  include_in_totals: number;
}

export type TxKind = 'payment' | 'receipt' | 'transfer' | 'journal' | 'opening' | 'reversal';
export type TxStatus = 'posted' | 'void';
export type ClearedStatus = 'uncleared' | 'cleared' | 'reconciled';

export interface Transaction {
  id: number;
  date: string; // YYYY-MM-DD
  kind: TxKind;
  reference: string;
  payee_id: number | null;
  description: string;
  memo: string | null;
  status: TxStatus;
  void_reason: string | null;
  reverses_id: number | null;
  created_at: string;
  updated_at: string;
  /** Optional HH:MM. */
  time: string | null;
  recurrence_id: number | null;
  /** "k/N" for instalment purchases. */
  installment: string | null;
}

export interface Entry {
  id: number;
  transaction_id: number;
  line_no: number;
  account_id: number;
  /** Base-currency minor units. */
  debit: number;
  credit: number;
  /** Currency of the account at posting time. */
  currency: string;
  /** Amount in the account's currency (minor units, always positive, same side as debit/credit). */
  fx_amount: number;
  /** Base units per 1 unit of `currency`, as a decimal string. "1" for base-currency lines. */
  fx_rate: string;
  memo: string | null;
  cleared: ClearedStatus;
  reconciliation_id: number | null;
}

/** A line ready to be written to `entries`. */
export interface EntryInput {
  account_id: number;
  debit: number;
  credit: number;
  currency: string;
  fx_amount: number;
  fx_rate: string;
  memo?: string | null;
}

export interface TransactionInput {
  date: string;
  time?: string | null;
  recurrence_id?: number | null;
  installment?: string | null;
  kind: TxKind;
  reference?: string | null;
  payee_id?: number | null;
  description: string;
  memo?: string | null;
  entries: EntryInput[];
}

export interface Payee {
  id: number;
  name: string;
  default_account_id: number | null;
  notes: string | null;
}

export interface Reconciliation {
  id: number;
  account_id: number;
  statement_date: string;
  statement_balance: number;
  completed_at: string;
}

export interface AuditRecord {
  id: number;
  ts: string;
  action: 'create' | 'update' | 'void' | 'reverse' | 'delete';
  entity: string;
  entity_id: number;
  before_json: string | null;
  after_json: string | null;
}

/** Per-account totals used by every report. Amounts in base minor units. */
export interface AccountTotals {
  account_id: number;
  debit: number;
  credit: number;
  /** Signed native-currency movement: debits positive, credits negative. */
  native: number;
}
