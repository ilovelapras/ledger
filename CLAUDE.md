# Ledger - Personal Finance App (Double-Entry Accounting)

## Project Context
- **Platform**: iOS app developed on Windows 11
- **Target**: Personal use only (no App Store submission)
- **Cost constraint**: Free development and ongoing usage
- **Distribution**: Expo Dev Client + EAS Build (free tier) + AltStore/Sideloadly on Windows

## User Requirements
- **Accounting model**: Double-entry (proper debits/credits, chart of accounts, balanced books)
- **Books for**: Personal finances, kept by an accountant (detail is welcome)
- **Currency**: One base (reporting) currency chosen at first launch; balance-sheet accounts may be held in foreign currencies
- **Tax**: None (no GST/VAT handling)
- **Database**: Local-first, offline (SQLite via expo-sqlite)
- **Core features**: Payments, receipts, transfers to/from banks, journals; Balance Sheet, Profit & Loss, Trial Balance, ledgers
- **Future**: Camera/OCR for receipts (deferred)
- **React/TS experience**: Some experience

## Technical Stack
| Layer | Choice |
|-------|--------|
| Framework | Expo + TypeScript (SDK 57) |
| Navigation | Expo Router (file-based); tabs from `expo-router/js-tabs` |
| Database | expo-sqlite (synchronous API via `SQLiteProvider`) |
| State | Zustand (`version` counter bumped after writes) |
| Forms | React Hook Form + Zod |
| Styling | NativeWind 4 (Tailwind CSS v3) |
| Icons | expo-symbols (SF Symbols) |
| Tests | Jest 29 + Node's built-in `node:sqlite` (real SQL, no device needed) |
| Build | EAS Build (free tier: 30 min/mo) |
| Install | AltStore (Windows) - auto-refresh on WiFi |

Read AGENTS.md: check the versioned Expo docs (https://docs.expo.dev/versions/v57.0.0/) before using an Expo API.

## Money rules (important)
- **All amounts are integers in minor units** (cents). Never store or add floats. `domain/money.ts` parses text → cents without floating point.
- `entries.debit/credit` are in the **base currency**. `entries.fx_amount` is the amount in the account's own currency, `fx_rate` = base units per 1 foreign unit (TEXT).
- Income, expense and equity accounts are always in the base currency.

## Data Model (SQLite, `db/schema.ts`, versioned with `PRAGMA user_version`)

```
settings        key, value                      base_currency, owner_name, lock_date, onboarded, seq_<kind>
accounts        code (unique), name, type, subtype (bank|cash|credit_card|loan|investment|receivable|payable|property|general),
                parent_id, currency, is_placeholder (header, not postable), institution, account_no, notes, is_active
payees          name (unique, nocase), default_account_id (learned from last use), notes
transactions    date, kind (payment|receipt|transfer|journal|opening|reversal), reference (PAY-000001…), payee_id,
                description, memo, status (posted|void), void_reason, reverses_id, created_at, updated_at
entries         transaction_id, line_no, account_id, debit, credit (INTEGER base cents, CHECK one-sided),
                currency, fx_amount, fx_rate, memo, cleared (uncleared|cleared|reconciled), reconciliation_id
reconciliations account_id, statement_date, statement_balance, completed_at
audit_log       ts, action, entity, entity_id, before_json, after_json
```

**Account Code Ranges**: 1xxx=Assets, 2xxx=Liabilities, 3xxx=Equity, 4xxx=Income, 5xxx=Expenses.
**System accounts** (`db/seed.ts` `SYSTEM_CODES`): 3000 Opening Balance Equity, 3100 Retained Earnings, 4900 Exchange Gain, 5900 Exchange Loss, 5810 Bank Charges.

## Posting rules (`db/transactions.ts`)
- Debits = credits exactly (integer cents); ≥ 2 lines; no header/inactive accounts; line currency must match the account.
- Nothing can be posted, edited or voided on/before the **lock date** (Settings).
- Lines in a completed **reconciliation** are immutable (undo the reconciliation first).
- Posted transactions are **voided** (kept, excluded from balances) or **reversed** (mirror entry on a new date), never deleted.
- Every create/update/void/reverse writes `audit_log` (shown as History on the transaction screen).
- FX: buying foreign currency books it at the base cost paid; money leaving a foreign account defaults to its average **book rate**
  (`bookRate()`); selling at a different rate posts the difference to 4900/5900.

## App Structure (Expo Router)
```
app/
├── _layout.tsx              SQLiteProvider(onInit=migrate) + Stack
├── global.css               NativeWind entry
├── onboarding.tsx           First run: owner name + base currency
├── (tabs)/_layout.tsx       Tabs; redirects to onboarding until set up
├── (tabs)/index.tsx         Overview: net worth, month income/expense, bank & card balances, quick actions, recent
├── (tabs)/transactions.tsx  Search (payee/description/ref/account/amount), filters (date, type, status, account), grouped by day
├── (tabs)/accounts.tsx      Collapsible chart of accounts with balances (native + base currency)
├── (tabs)/reports.tsx       Report list + general ledger account picker
├── transaction/new.tsx      ?mode=payment|receipt|transfer|journal &accountId= &duplicate=
├── transaction/[id].tsx     Lines, Edit / Duplicate / Reverse / Void, audit history
├── transaction/edit/[id].tsx
├── account/[id].tsx         Ledger with opening balance b/f, running balance, CSV export
├── account/edit.tsx         Create/edit (?id=, ?type=), deactivate, delete if unused
├── account/reconcile/[id].tsx  Statement date + balance, tick cleared lines, finish when difference = 0, undo last
├── report/[type].tsx        balance-sheet | profit-loss (with previous-period comparison) | trial-balance | journal; CSV export
├── opening.tsx              Opening balances (one 'opening' transaction, editable)
├── payees.tsx               Rename, default category, delete
└── settings.tsx             Owner, base currency, lock date, backup/restore JSON, journal CSV, erase all
```

## Code layout
- `domain/` — pure TypeScript, unit-tested, no React/Expo imports
  - `money.ts` parse/format/convert minor units, currency list
  - `accounting.ts` normal balances, labels, account tree + roll-up
  - `posting.ts` builders: payment, receipt, transfer (FX gain/loss, fee), journal, opening balance, reversal; `validateEntries`
  - `reports.ts` balance sheet (retained + current-year earnings computed), P&L, trial balance, running ledger
  - `txForm.ts` entry-form values ⇄ entry lines (edit/duplicate reload any transaction; falls back to journal layout)
  - `dates.ts` ISO dates, range presets
- `db/` — repositories taking a `Db` interface (`db/client.ts`); expo-sqlite's database satisfies it
  - `schema.ts` migrations, `seed.ts` personal chart of accounts (~55 accounts), `settings.ts`, `accounts.ts`, `payees.ts`,
    `transactions.ts`, `reports.ts`, `reconcile.ts`, `backup.ts` (JSON backup/restore, CSV), `audit.ts`
  - `__tests__/` — integration tests on in-memory `node:sqlite` via `testDb.ts`
- `hooks/useLedger.ts` — `useDb`, `useLedgerQuery(fn, deps)`, `useMutation()` (writes + refresh + error alert), `useSettings`
- `components/` — `ui/` (Button, Card, Input, Select, DateField, Misc: MoneyText, Segmented, Chips, Badge, ListRow, Banner…),
  `AccountPicker`, `DateRangeBar`, `forms/TransactionForm` (live posting preview; Save disabled until balanced)
- `utils/share.ts` — write a temp file and open the iOS share sheet

## Progress So Far
- [x] Expo SDK 57 project, dependencies aligned (`npx expo-doctor`: 21/21 checks pass)
- [x] Schema v1 with integer money, constraints, audit log, reconciliation
- [x] Domain logic + repositories with 46 passing tests (`npm test`)
- [x] All screens above; `npx tsc --noEmit` clean; `npx expo export --platform ios` bundles
- [ ] Tested on a real iPhone (Expo Go) — not yet done

## Next Steps
1. Test on device via Expo Go → Dev Client → EAS Build
2. Recurring/scheduled transactions
3. Budgets by expense category
4. Unrealised FX revaluation of foreign-currency balances at period end
5. Bank statement CSV import (match to existing entries)
6. Camera/OCR for receipts (deferred)
7. Dark mode

## Free Tier Constraints
- EAS Build: 30 min/month (~2-3 iOS builds)
- Apple Free Developer: 7-day cert expiry, 3 apps max, no push/background
- AltStore: Weekly refresh (auto on same WiFi)
- Workaround: Build locally on Mac if needed (not available)
- Data is only on the phone: export a JSON backup regularly (Settings) — a reinstall can wipe it.

## Key Accounting Logic
- Every transaction must balance: Σ(debits) = Σ(credits)
- Balance Sheet: Assets = Liabilities + Equity
- P&L: Net Income = Income - Expenses → flows to Equity (Retained Earnings)
- Trial Balance: All accounts with debit/credit/balance columns
- Account normal balances: Assets/Expenses = Debit, Liabilities/Equity/Income = Credit
- No closing entries are posted: the balance sheet shows prior years' net income as retained earnings and this calendar
  year's as current year earnings.

## Known Issues
- Windows PowerShell 5.1 does not support `&&`; chain commands with `;` (e.g. `git add -A; git commit -m "msg"`).
- jest-expo is not used (its peer deps conflict with RN 0.86.x); tests cover `domain/` and `db/` only, not React components.

## How to Run
```powershell
cd C:\Users\loois\ledger
npm test                 # domain + database tests
npx tsc --noEmit         # type-check
npx expo start --clear   # scan the QR code with Expo Go on the iPhone
```
