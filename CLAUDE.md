# Ledger - Personal Finance App (Double-Entry Accounting)

## Project Context
- **Platform**: iOS app developed on Windows 11
- **Target**: Personal use only (no App Store submission)
- **Cost constraint**: Free development and ongoing usage
- **Distribution**: Expo Dev Client + EAS Build (free tier) + AltStore/Sideloadly on Windows

## User Requirements
- **Accounting model**: Double-entry (proper debits/credits, chart of accounts, balanced books)
- **Database**: Local-first, offline (SQLite via expo-sqlite)
- **Core features**: Balance Sheet, Profit & Loss, Trial Balance, Journal Entry
- **Future**: Camera/OCR for receipts (deferred)
- **React/TS experience**: Some experience

## Technical Stack
| Layer | Choice |
|-------|--------|
| Framework | Expo + TypeScript (SDK 57) |
| Navigation | Expo Router (file-based) |
| Database | expo-sqlite (SQLite) |
| State | Zustand + React Context |
| Forms | React Hook Form + Zod |
| Styling | NativeWind (Tailwind CSS v3) |
| Build | EAS Build (free tier: 30 min/mo) |
| Install | AltStore (Windows) - auto-refresh on WiFi |

## Data Model (SQLite)

```sql
-- Chart of Accounts
accounts: id, code, name, type(asset|liability|equity|income|expense), parent_id, is_active, created_at

-- Journal Headers
transactions: id, date, description, reference, created_at

-- Journal Lines (double-entry)
entries: id, transaction_id, account_id, debit, credit
  CHECK (debit > 0 OR credit > 0) AND (debit = 0 OR credit = 0)
```

**Account Code Ranges**: 1xxx=Assets, 2xxx=Liabilities, 3xxx=Equity, 4xxx=Income, 5xxx=Expenses

## App Structure (Expo Router)
```
app/
├── _layout.tsx                    # Root layout, providers
├── providers.tsx                  # SafeArea, QueryClient, ThemeProvider
├── (tabs)/
│   ├── _layout.tsx                # Tab navigator
│   ├── index.tsx                  # Dashboard (summary cards, recent transactions)
│   ├── journal.tsx                # Transaction list + summary
│   ├── accounts.tsx               # Chart of accounts hierarchy + balances
│   └── reports.tsx                # Balance Sheet, P&L, Trial Balance
├── transaction/
│   ├── new.tsx                    # New journal entry (multi-line form)
│   └── [id].tsx                   # View/edit transaction
├── account/
│   └── [id].tsx                   # General ledger for account
├── settings.tsx                   # Export/import, reset data
└── global.css                     # NativeWind entry (Tailwind directives)
```

## Core Modules Implemented

### Database Layer (`db/`)
- `schema.ts` - SQLite init, migrations, default account seeding (17 accounts)
- `repositories/AccountRepo.ts` - Account CRUD, hierarchy, tree building
- `repositories/TransactionRepo.ts` - Transaction CRUD, balanced validation, balances
- `repositories/EntryRepo.ts` - Entry operations, trial balance queries
- `index.ts` - Database initialization, migration runner

### Accounting Hooks (`hooks/`)
- `useAccounts.ts` - Zustand store: account CRUD, tree, balances, refresh
- `useJournal.ts` - Zustand store: transaction entry, validation, balanced check
- `useReports.ts` - Zustand store: Balance Sheet, P&L, Trial Balance generation
- `index.ts` - Barrel exports

### UI Components (`components/`)
- `ui/Button.tsx` - Primary, secondary, outline, ghost, danger variants
- `ui/Card.tsx` - Card, Header, Title, Content, Footer
- `ui/Input.tsx` - With label, error, helper text, icons
- `ui/Select.tsx` - Searchable modal dropdown
- `ui/index.ts` - Barrel exports
- `forms/JournalEntryForm.tsx` - Multi-line debit/credit entry form (React Hook Form + Zod)

### Utilities
- `utils/accounting.ts` - Double-entry helpers, normal balance, formatting, validation

### Configuration
- `babel.config.js` - NativeWind preset, reanimated, expo-router
- `metro.config.js` - withNativeWind wrapper, global.css input
- `tailwind.config.js` - Custom colors (primary/accent), content paths
- `eas.json` - EAS Build profiles (development, preview, production)
- `app.json` - Expo config with expo-router, expo-sqlite plugins
- `global.d.ts` / `nativewind-env.d.ts` - TypeScript declarations

## Progress So Far
- [x] Initialized Expo project "ledger" with TypeScript template
- [x] Installed dependencies: expo-sqlite, expo-router, zustand, react-hook-form, zod, nativewind, tailwindcss@3, date-fns, @tanstack/react-query, babel-preset-expo
- [x] Configured babel.config.js (nativewind/babel preset, jsxImportSource)
- [x] Created metro.config.js with withNativeWind wrapper
- [x] Created tailwind.config.js with custom colors
- [x] Created app/global.css with Tailwind directives
- [x] Created directory structure
- [x] Created types/index.ts with TypeScript interfaces
- [x] Implemented database schema, migrations, repositories
- [x] Implemented accounting hooks (accounts, journal, reports)
- [x] Implemented UI components (Button, Card, Input, Select, forms)
- [x] Implemented Expo Router screens (Dashboard, Journal, Accounts, Reports, Transaction, Settings)
- [x] Implemented root layout with providers
- [x] Implemented EAS build configuration
- [x] Fixed NativeWind v4/Tailwind CSS v3 compatibility
- [x] Fixed global.css import path
- [x] Added database table existence checks and seeding

## Next Steps
1. Test on device via Expo Go → Dev Client → EAS Build
2. Add camera/OCR for receipts (deferred)
3. Add transaction edit screen (`transaction/[id]/edit.tsx`)
4. Add account edit modal improvements
5. Add date range picker for reports
6. Add account hierarchy expand/collapse
7. Add search/filter to journal and accounts
8. Add keyboard shortcuts / accessibility

## Free Tier Constraints
- EAS Build: 30 min/month (~2-3 iOS builds)
- Apple Free Developer: 7-day cert expiry, 3 apps max, no push/background
- AltStore: Weekly refresh (auto on same WiFi)
- Workaround: Build locally on Mac if needed (not available)

## Key Accounting Logic
- Every transaction must balance: Σ(debits) = Σ(credits)
- Balance Sheet: Assets = Liabilities + Equity
- P&L: Net Income = Income - Expenses → flows to Equity (Retained Earnings)
- Trial Balance: All accounts with debit/credit/balance columns
- Account normal balances: Assets/Expenses = Debit, Liabilities/Equity/Income = Credit

## Known Issues
- Reanimated warning: "Reading from value during component render" - cosmetic, from Expo Router integration
- Database initialization: Ensure first run creates tables properly (added table existence checks)

## How to Run
```bash
cd C:\Users\loois\ledger
npx expo start --clear
# Scan QR code with Expo Go on iOS device
```
