# Ledger - Personal Expense Tracker (Money Manager style, double-entry underneath)

## Project Context
- **Platform**: iOS app developed on Windows 11 (also tested on Android via Expo Go)
- **Target**: Personal use only (no App Store submission)
- **Cost constraint**: Free development and ongoing usage
- **Distribution**: Expo Dev Client + EAS Build (free tier) + AltStore/Sideloadly on Windows

## User Requirements
- **What it is**: A personal expense tracker that works like **Money Manager (Realbyte)**
  (https://play.google.com/store/apps/details?id=com.realbyteapps.moneymanagerfree). Follow its screens and flows.
- **Who uses it**: An accountant, so sound accounting principles apply *inside* a good expense tracker — but don't expose
  accountant tooling (journals, trial balance, reconciliation) in the UI unless asked.
- **Accounting model**: Double-entry under the hood (every entry balances; income/expense = P&L, accounts = balance sheet)
- **Currency**: Main currency chosen at first launch; accounts may be held in other currencies (sub-currencies) with a rate
- **Tax**: None
- **Database**: Local-first, offline (SQLite via expo-sqlite)
- **React/TS experience**: Some experience

## Technical Stack
| Layer | Choice |
|-------|--------|
| Framework | Expo + TypeScript (SDK 57) |
| Navigation | Expo Router (file-based); tabs from `expo-router/js-tabs` |
| Database | expo-sqlite (synchronous API via `SQLiteProvider`) |
| State | Zustand (`version` counter bumped after writes) |
| Forms | React Hook Form + Zod |
| Styling | NativeWind 4 (Tailwind CSS v3); colours in `components/mm/theme.ts` |
| Icons | `@expo/vector-icons` Ionicons (iOS + Android); emoji for categories/accounts |
| Charts | react-native-svg, hand-drawn (`components/mm/Charts.tsx`) — no chart library |
| Photos / lock | expo-image-picker, expo-file-system, expo-secure-store, expo-local-authentication |
| Tests | Jest 29 + Node's built-in `node:sqlite` (real SQL, no device needed) |
| Build | EAS Build (free tier: 30 min/mo) |
| Install | AltStore (Windows) - auto-refresh on WiFi |

Read AGENTS.md: check the versioned Expo docs (https://docs.expo.dev/versions/v57.0.0/) before using an Expo API.

## Money rules (important)
- **All amounts are integers in minor units** (cents). Never store or add floats. `domain/money.ts` parses text → cents without floating point.
- `entries.debit/credit` are in the **main currency**. `entries.fx_amount` is the amount in the account's own currency,
  `fx_rate` = main-currency units per 1 foreign unit (TEXT).
- Income/expense categories are always in the main currency.

## How Money Manager concepts map to the engine
| Money Manager | Engine |
|---|---|
| Expense / Income / Transfer | transaction `kind` payment / receipt / transfer (builders in `domain/posting.ts`) |
| Category › subcategory | income/expense accounts, 2 levels, `icon` emoji, `sort_order` |
| Accounts tab groups (Cash, Accounts, Card, Debit Card, Savings, Top-Up/Prepaid, Investments, Overdrafts, Loan, Insurance, Others) | asset/liability accounts with `grp` (`db/seed.ts` `ACCOUNT_GROUPS`; Card/Overdrafts/Loan are liabilities) |
| Account initial balance | `opening` transaction dated 1970-01-01 vs 3000 Opening Balance Equity (never income) |
| Note / Description | `transactions.description` / `memo` |
| Delete | soft delete = `voidTransaction` (hidden everywhere, kept in `audit_log`) |
| Repeat | `recurrences` + `postDueRecurrences()` on every launch (catch-up, idempotent) |
| Instalments (card) | N monthly payment transactions, `installment` = "k/N" |
| Favourites (bookmarks) | `favorites.template_json` (entry-form values without date) |
| Budget | `budgets` (month '' = every month, 'YYYY-MM' = override) per main expense category |
| Monthly start date | setting `month_start_day` (1–28); `domain/periods.ts` |
System accounts (`SYSTEM_CODES`): 3000 Opening Balance Equity, 3100 Retained Earnings, 4900 Exchange Gain, 5810 Fees, 5900 Exchange Loss — hidden from category/account lists.

## Data Model (`db/schema.ts`, versioned with `PRAGMA user_version`; currently v2)
```
settings        key/value: base_currency, onboarded, month_start_day, week_start, passcode_enabled, biometric_enabled,
                last_money_account, seq_<kind>
accounts        code (internal, auto), name, type, subtype, parent_id, currency, is_placeholder, icon, grp, sort_order,
                statement_day, payment_day, payment_account_id, include_in_totals, notes, is_active
transactions    date, time, kind, reference, description, memo, status (posted|void), recurrence_id, installment, …
entries         transaction_id, line_no, account_id, debit, credit (INTEGER main-currency cents, one-sided CHECK),
                currency, fx_amount, fx_rate, memo, cleared
budgets         account_id, month ('' | 'YYYY-MM'), amount
recurrences     kind, template_json, freq (daily|weekly|biweekly|monthly|month_end|yearly), start_date, end_date, posted_count, active
favorites       name, kind, template_json, sort_order
attachments     transaction_id, uri (photo file in documents/receipts)
payees, reconciliations, audit_log   (v1 engine tables; not shown in the UI)
```
v2 migration: fresh books get Money Manager's default categories + Cash / Bank Account / Card; books with transactions keep their chart.
Unversioned prototype databases are set aside as `legacy_*` tables.

## App Structure (Expo Router)
```
app/
├── _layout.tsx                 SQLiteProvider(onInit: migrate + postDueRecurrences) → LockGate → Stack
├── onboarding.tsx              Main currency → Accounts tab
├── (tabs)/index.tsx            Trans.: month switcher, Income/Exp/Total, Daily | Calendar | Weekly | Monthly | Summary, search, + button
├── (tabs)/stats.tsx            Stats: Weekly/Monthly/Annually, Stats (pie + list) | Budget (progress bars) | Note
├── (tabs)/accounts.tsx         Assets / Liabilities / Total, accounts by group, card payable; hold to edit, + to add
├── (tabs)/more.tsx             Categories, budgets, repeat, favourites, main currency, month/week start, passcode, backup/restore, CSV, erase
├── transaction/new.tsx         ?mode=&date=&accountId=&toId=&amount=&copy=&favorite=
├── transaction/[id].tsx        Edit in place, Copy, Delete, photo viewer
├── account/[id].tsx            Monthly list with running balance; card statement + "Pay card"
├── account/edit.tsx            Group, name, icon, currency, initial balance (+rate), card days/paid-from, include in totals
├── stats/[id].tsx              Category drill-down: subcategories, 6-month bars, transactions
└── settings/                   budgets, categories, repeat, favorites, passcode
```

## Code layout
- `domain/` — pure TypeScript, unit-tested: `money`, `posting` (balanced lines), `txForm` (form ⇄ lines), `reports`,
  `periods`, `recurrence` (+ instalment split), `card` (statement cycle), `budget`, `calc` (keypad), `accounting`, `dates`
- `db/` — repositories taking a `Db` interface (`db/client.ts`): `transactions`, `moneyAccounts`, `categories`, `stats`,
  `budgets`, `recurrences`, `favorites`, `attachments`, `backup`, `formContext`, plus v1 `reports`/`reconcile`/`payees`/`audit`
- `components/mm/` — Money Manager UI: `EntryForm` (Income/Expense/Transfer, keypad, category grid, repeat, instalments,
  favourites, photos), `Sheets`, `Keypad`, `Charts`, `Common` (period header, totals bar, list row, FAB), `LockGate`, `PromptModal`
- `hooks/useLedger.ts` — `useDb`, `useLedgerQuery(fn, deps)`, `useMutation()`, `useSettings`
- `utils/` — `share.ts` (temp file + share sheet), `photos.ts` (pick/copy/delete receipt photos)

## Progress So Far
- [x] Double-entry engine with integer cents, multi-currency, audit trail, backup (v1)
- [x] Schema v2 + Money Manager features: categories with icons, account groups, initial balances, card cycle,
      repeat, instalments, favourites, budgets, photos, passcode/Face ID, month/week start
- [x] Screens: Trans. (5 views + search), Stats (pie/budget/note + drill-down), Accounts, More, entry form
- [x] 77 tests; `npx tsc --noEmit` clean; `npx expo-doctor` 21/21; iOS + Android bundles build
- [x] Runs on an Android phone in Expo Go (onboarding, Accounts, Trans., Stats screens checked)
- [ ] Full manual pass on iPhone (Expo Go)

## Next Steps
1. Manual test on iPhone; fix anything that looks off
2. Dark mode
3. Bank statement / CSV import
4. Receipt OCR (deferred)

## Free Tier Constraints
- EAS Build: 30 min/month (~2-3 iOS builds)
- Apple Free Developer: 7-day cert expiry, 3 apps max, no push/background
- AltStore: Weekly refresh (auto on same WiFi)
- Data is only on the phone: back up from More → Backup regularly (photos are not in backups).

## Known Issues
- Windows PowerShell 5.1 does not support `&&`; chain with `;`. For commit messages with quotes use `git commit -F file`.
- Face ID does not work inside Expo Go on iOS (needs a dev/EAS build); the PIN always works.
- jest-expo is not used (peer-dep conflict with RN 0.86.x); tests cover `domain/` and `db/` only.
- Expo Go's floating "Tools" button can cover the top-right header buttons while developing.

## How to Run
```powershell
cd C:\Users\loois\ledger
npm test                 # domain + database tests
npx tsc --noEmit         # type-check
npx expo start --clear   # scan the QR code with Expo Go (iPhone camera / Android Expo Go app)
```
