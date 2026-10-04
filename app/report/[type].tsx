import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { displayDate, today } from '../../domain/dates';
import { toDecimalString } from '../../domain/money';
import type { StatementSection } from '../../domain/reports';
import { journalCsv, toCsv } from '../../db/backup';
import { getBalanceSheet, getProfitAndLoss, getTrialBalance } from '../../db/reports';
import { listTransactions } from '../../db/transactions';
import { useDb, useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { DateRangeBar, rangeFromPreset, type DateRange } from '../../components/DateRangeBar';
import { Banner, Button, DateField, EmptyState, ListRow, MoneyText } from '../../components/ui';
import { shareTextFile } from '../../utils/share';

const TITLES: Record<string, string> = {
  'balance-sheet': 'Balance Sheet',
  'profit-loss': 'Profit & Loss',
  'trial-balance': 'Trial Balance',
  journal: 'Journal',
};

export default function Report() {
  const { type } = useLocalSearchParams<{ type: string }>();
  return (
    <>
      <Stack.Screen options={{ title: TITLES[type] ?? 'Report' }} />
      {type === 'balance-sheet' ? <BalanceSheetView /> : null}
      {type === 'profit-loss' ? <ProfitLossView /> : null}
      {type === 'trial-balance' ? <TrialBalanceView /> : null}
      {type === 'journal' ? <JournalView /> : null}
    </>
  );
}

function AsOfBar({ value, onChange, onExport }: { value: string; onChange: (d: string) => void; onExport: () => void }) {
  return (
    <View className="flex-row items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
      <View className="flex-row items-center gap-2">
        <Text className="text-sm text-gray-600">As of</Text>
        <DateField inline value={value} onChange={onChange} />
      </View>
      <Button size="sm" variant="outline" onPress={onExport}>
        Export CSV
      </Button>
    </View>
  );
}

function Amount({ value, currency, bold, width = 'w-28' }: { value: number | undefined; currency: string; bold?: boolean; width?: string }) {
  return (
    <View className={`${width} items-end`}>
      {value !== undefined ? (
        <MoneyText amount={value} currency={currency} className={`text-sm text-gray-900 ${bold ? 'font-semibold' : ''}`} />
      ) : null}
    </View>
  );
}

function SectionBlock({ section, currency, compare }: { section: StatementSection; currency: string; compare?: boolean }) {
  return (
    <View className="mx-4 mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <View className="flex-row items-center border-b border-gray-200 bg-gray-50 px-3 py-2">
        <Text className="flex-1 text-sm font-semibold text-gray-900">{section.title}</Text>
        {compare ? <Text className="w-28 text-right text-xs text-gray-500">Previous</Text> : null}
      </View>
      {section.rows.length === 0 ? <Text className="px-3 py-3 text-sm text-gray-400">No balances</Text> : null}
      {section.rows.map((r) => (
        <Pressable
          key={r.key}
          className="flex-row items-center border-b border-gray-100 py-2 pr-3 active:bg-gray-50"
          style={{ paddingLeft: 12 + r.depth * 14 }}
          disabled={!r.accountId || r.isHeader}
          onPress={() => router.push(`/account/${r.accountId}`)}
        >
          <Text numberOfLines={1} className={`flex-1 text-sm ${r.isHeader ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
            {r.code ? `${r.code}  ` : ''}
            {r.label}
          </Text>
          <Amount value={r.amount} currency={currency} bold={r.isHeader} />
          {compare ? <Amount value={r.compare} currency={currency} /> : null}
        </Pressable>
      ))}
      <View className="flex-row items-center px-3 py-2.5">
        <Text className="flex-1 text-sm font-bold text-gray-900">Total {section.title}</Text>
        <Amount value={section.total} currency={currency} bold />
        {compare ? <Amount value={section.compareTotal} currency={currency} bold /> : null}
      </View>
    </View>
  );
}

function TotalLine({ label, value, currency, compare }: { label: string; value: number; currency: string; compare?: number }) {
  return (
    <View className="mx-4 mt-4 flex-row items-center rounded-xl bg-primary-700 px-3 py-3">
      <Text className="flex-1 text-base font-bold text-white">{label}</Text>
      <View className="w-28 items-end">
        <MoneyText amount={value} currency={currency} className="text-base font-bold text-white" />
      </View>
      {compare !== undefined ? (
        <View className="w-28 items-end">
          <MoneyText amount={compare} currency={currency} className="text-sm text-primary-100" />
        </View>
      ) : null}
    </View>
  );
}

function sectionCsv(s: StatementSection, base: string, compare?: boolean): unknown[][] {
  return [
    [s.title],
    ...s.rows.map((r) => [
      r.code ?? '',
      `${'  '.repeat(r.depth)}${r.label}`,
      toDecimalString(r.amount, base),
      ...(compare ? [toDecimalString(r.compare ?? 0, base)] : []),
    ]),
    ['', `Total ${s.title}`, toDecimalString(s.total, base), ...(compare ? [toDecimalString(s.compareTotal ?? 0, base)] : [])],
    [],
  ];
}

function BalanceSheetView() {
  const { baseCurrency: base } = useSettings();
  const [asOf, setAsOf] = useState(today());
  const bs = useLedgerQuery((db) => getBalanceSheet(db, asOf), [asOf]);
  const exportCsv = () =>
    shareTextFile(
      `balance-sheet-${asOf}.csv`,
      toCsv([
        [`Balance Sheet as of ${asOf}`, '', base],
        [],
        ...sectionCsv(bs.assets, base),
        ...sectionCsv(bs.liabilities, base),
        ...sectionCsv(bs.equity, base),
        ['', 'Total liabilities and equity', toDecimalString(bs.totalLiabilitiesAndEquity, base)],
      ]),
      'csv'
    );
  return (
    <View className="flex-1 bg-gray-50">
      <AsOfBar value={asOf} onChange={setAsOf} onExport={exportCsv} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {bs.difference !== 0 ? (
          <Banner tone="error">{`Out of balance by ${toDecimalString(bs.difference, base)} ${base}.`}</Banner>
        ) : null}
        <SectionBlock section={bs.assets} currency={base} />
        <SectionBlock section={bs.liabilities} currency={base} />
        <SectionBlock section={bs.equity} currency={base} />
        <TotalLine label="Liabilities + Equity" value={bs.totalLiabilitiesAndEquity} currency={base} />
        <Text className="mx-4 mt-3 text-xs text-gray-500">
          {`Current year earnings are income less expenses from 1 Jan to ${displayDate(asOf)}; earlier years roll into retained earnings.`}
        </Text>
      </ScrollView>
    </View>
  );
}

function ProfitLossView() {
  const { baseCurrency: base } = useSettings();
  const [range, setRange] = useState<DateRange>(rangeFromPreset('this_month'));
  const [compare, setCompare] = useState(true);
  const pl = useLedgerQuery((db) => getProfitAndLoss(db, range.from, range.to, compare), [range.from, range.to, compare]);
  const exportCsv = () =>
    shareTextFile(
      `profit-loss-${range.from}-to-${range.to}.csv`,
      toCsv([
        [`Profit & Loss ${range.from} to ${range.to}`, '', base, ...(compare ? ['Previous period'] : [])],
        [],
        ...sectionCsv(pl.income, base, compare),
        ...sectionCsv(pl.expenses, base, compare),
        ['', 'Net income', toDecimalString(pl.netIncome, base), ...(compare ? [toDecimalString(pl.compareNetIncome ?? 0, base)] : [])],
      ]),
      'csv'
    );
  return (
    <View className="flex-1 bg-gray-50">
      <DateRangeBar value={range} onChange={setRange} />
      <View className="flex-row items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <View className="flex-row items-center gap-2">
          <Switch value={compare} onValueChange={setCompare} />
          <Text className="text-sm text-gray-600">Compare previous period</Text>
        </View>
        <Button size="sm" variant="outline" onPress={exportCsv}>
          Export CSV
        </Button>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="mx-4 mt-3 text-xs text-gray-500">{`${displayDate(range.from)} – ${displayDate(range.to)}`}</Text>
        <SectionBlock section={pl.income} currency={base} compare={compare} />
        <SectionBlock section={pl.expenses} currency={base} compare={compare} />
        <TotalLine label="Net income" value={pl.netIncome} currency={base} compare={compare ? pl.compareNetIncome : undefined} />
      </ScrollView>
    </View>
  );
}

function TrialBalanceView() {
  const { baseCurrency: base } = useSettings();
  const [asOf, setAsOf] = useState(today());
  const tb = useLedgerQuery((db) => getTrialBalance(db, asOf), [asOf]);
  const exportCsv = () =>
    shareTextFile(
      `trial-balance-${asOf}.csv`,
      toCsv([
        [`Trial Balance as of ${asOf}`],
        ['Code', 'Account', `Debit (${base})`, `Credit (${base})`],
        ...tb.rows.map((r) => [r.account.code, r.account.name, r.debit ? toDecimalString(r.debit, base) : '', r.credit ? toDecimalString(r.credit, base) : '']),
        ['', 'Total', toDecimalString(tb.totalDebit, base), toDecimalString(tb.totalCredit, base)],
      ]),
      'csv'
    );
  return (
    <View className="flex-1 bg-gray-50">
      <AsOfBar value={asOf} onChange={setAsOf} onExport={exportCsv} />
      <FlatList
        data={tb.rows}
        keyExtractor={(r) => String(r.account.id)}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <>
            <Banner tone={tb.balanced ? 'info' : 'error'}>
              {tb.balanced ? '✓ Balanced: total debits equal total credits.' : 'Out of balance: debits and credits differ.'}
            </Banner>
            <View className="mt-3 flex-row border-b border-gray-200 bg-white px-4 py-2">
              <Text className="flex-1 text-xs font-semibold text-gray-500">Account</Text>
              <Text className="w-28 text-right text-xs font-semibold text-gray-500">Debit</Text>
              <Text className="w-28 text-right text-xs font-semibold text-gray-500">Credit</Text>
            </View>
          </>
        }
        renderItem={({ item: r }) => (
          <ListRow
            title={`${r.account.code}  ${r.account.name}`}
            onPress={() => router.push(`/account/${r.account.id}`)}
            right={
              <View className="flex-row">
                <Amount value={r.debit || undefined} currency={base} />
                <Amount value={r.credit || undefined} currency={base} />
              </View>
            }
          />
        )}
        ListEmptyComponent={<EmptyState title="No balances" message="Nothing has been posted up to this date." />}
        ListFooterComponent={
          <View className="flex-row border-t-2 border-gray-300 bg-white px-4 py-3">
            <Text className="flex-1 text-sm font-bold text-gray-900">Total</Text>
            <View className="mr-3 flex-row">
              <Amount value={tb.totalDebit} currency={base} bold />
              <Amount value={tb.totalCredit} currency={base} bold />
            </View>
          </View>
        }
      />
    </View>
  );
}

function JournalView() {
  const db = useDb();
  const { baseCurrency: base } = useSettings();
  const [range, setRange] = useState<DateRange>(rangeFromPreset('this_month'));
  const rows = useLedgerQuery((d) => listTransactions(d, { from: range.from, to: range.to, limit: 1000 }).reverse(), [range.from, range.to]);
  return (
    <View className="flex-1 bg-gray-50">
      <DateRangeBar value={range} onChange={setRange} />
      <View className="flex-row items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <Text className="text-sm text-gray-600">{`${rows.length} transactions`}</Text>
        <Button
          size="sm"
          variant="outline"
          onPress={() => shareTextFile(`journal-${range.from}-to-${range.to}.csv`, journalCsv(db, range.from, range.to), 'csv')}
        >
          Export CSV
        </Button>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item: t }) => (
          <ListRow
            title={`${t.reference}  ${t.payee_name || t.description || ''}`}
            subtitle={`${displayDate(t.date)} · ${t.accounts}`}
            onPress={() => router.push(`/transaction/${t.id}`)}
            right={<MoneyText amount={t.amount ?? 0} currency={base} className="text-sm" />}
          />
        )}
        ListEmptyComponent={<EmptyState title="No transactions in this period" />}
      />
    </View>
  );
}
