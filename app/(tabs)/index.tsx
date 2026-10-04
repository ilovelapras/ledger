import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, SectionList, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { today } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import {
  calendarGrid,
  monthsIn,
  periodContaining,
  shiftPeriod,
  weekdayLabels,
  weeksIn,
  type Period,
} from '../../domain/periods';
import { journalCsv } from '../../db/backup';
import { getBudgetSummary } from '../../db/budgets';
import { dailyTotals, listTxRows, spendingByAccount, sumTotals, type DayTotals, type TxRow } from '../../db/stats';
import { useDb, useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { Amount, Fab, PeriodHeader, SubTabs, TotalsBar, TxListItem, usePeriodPrefs } from '../../components/mm/Common';
import { MM } from '../../components/mm/theme';
import { shareTextFile } from '../../utils/share';

type View_ = 'daily' | 'calendar' | 'weekly' | 'monthly' | 'summary';
const TABS: { value: View_; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'summary', label: 'Summary' },
];

export default function Trans() {
  const prefs = usePeriodPrefs();
  const { baseCurrency } = useSettings();
  const [view, setView] = useState<View_>('daily');
  const [anchor, setAnchor] = useState(today());
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const period = periodContaining(view === 'monthly' ? 'year' : 'month', anchor, prefs);
  const shift = (n: number) => setAnchor(shiftPeriod(period, n, prefs).from);

  const days = useLedgerQuery((db) => dailyTotals(db, period.from, period.to), [period.from, period.to]);
  const totals = sumTotals(days, period.from, period.to);

  return (
    <View className="flex-1" style={{ backgroundColor: MM.bg }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => setSearching((s) => !s)} hitSlop={10} className="px-4" accessibilityLabel="Search">
              <Ionicons name={searching ? 'close' : 'search'} size={22} color="#111827" />
            </Pressable>
          ),
        }}
      />
      {searching ? (
        <SearchView query={query} setQuery={setQuery} baseCurrency={baseCurrency} />
      ) : (
        <>
          <PeriodHeader period={period} onShift={shift} />
          <SubTabs tabs={TABS} value={view} onChange={setView} />
          <TotalsBar income={totals.income} expense={totals.expense} currency={baseCurrency} />
          {view === 'daily' ? <DailyView period={period} days={days} /> : null}
          {view === 'calendar' ? <CalendarView period={period} days={days} /> : null}
          {view === 'weekly' ? <WeeklyView period={period} days={days} /> : null}
          {view === 'monthly' ? (
            <MonthlyView
              year={period}
              days={days}
              onOpen={(m) => {
                setAnchor(m.from);
                setView('daily');
              }}
            />
          ) : null}
          {view === 'summary' ? <SummaryView period={period} income={totals.income} expense={totals.expense} /> : null}
        </>
      )}
      {!searching ? <Fab onPress={() => router.push('/transaction/new')} /> : null}
    </View>
  );
}

function useRows(period: Period) {
  return useLedgerQuery((db) => listTxRows(db, { from: period.from, to: period.to }), [period.from, period.to]);
}

function DayHeader({ date, totals, currency }: { date: string; totals?: DayTotals; currency: string }) {
  const d = parseISO(date);
  return (
    <View className="mt-2 flex-row items-center border-b border-gray-200 bg-white px-4 py-2">
      <Text className="w-9 text-xl font-bold text-gray-900">{format(d, 'd')}</Text>
      <View className="mr-2 rounded px-1.5 py-0.5" style={{ backgroundColor: d.getDay() === 0 ? MM.expense : d.getDay() === 6 ? MM.income : '#9ca3af' }}>
        <Text className="text-[11px] font-semibold text-white">{format(d, 'EEE')}</Text>
      </View>
      <Text className="flex-1 text-xs text-gray-500">{format(d, 'MM.yyyy')}</Text>
      {totals ? (
        <>
          <Amount value={totals.income} currency={currency} tone="income" className="w-24 text-right text-sm" />
          <Amount value={totals.expense} currency={currency} tone="expense" className="w-24 text-right text-sm" />
        </>
      ) : null}
    </View>
  );
}

function groupByDay(rows: TxRow[]) {
  const map = new Map<string, TxRow[]>();
  for (const r of rows) {
    const list = map.get(r.date) ?? [];
    list.push(r);
    map.set(r.date, list);
  }
  return [...map.entries()].map(([title, data]) => ({ title, data }));
}

function DailyView({ period, days }: { period: Period; days: DayTotals[] }) {
  const { baseCurrency } = useSettings();
  const rows = useRows(period);
  const byDay = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const sections = useMemo(() => groupByDay(rows), [rows]);
  return (
    <SectionList
      sections={sections}
      keyExtractor={(r) => String(r.id)}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <DayHeader date={section.title} totals={byDay.get(section.title)} currency={baseCurrency} />}
      renderItem={({ item }) => <TxListItem row={item} baseCurrency={baseCurrency} onPress={() => router.push(`/transaction/${item.id}`)} />}
      ListEmptyComponent={<Empty text="No transactions this month." />}
      contentContainerStyle={{ paddingBottom: 96 }}
    />
  );
}

function CalendarView({ period, days }: { period: Period; days: DayTotals[] }) {
  const prefs = usePeriodPrefs();
  const { baseCurrency } = useSettings();
  const [selected, setSelected] = useState<string | null>(null);
  const byDay = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const grid = calendarGrid(period, prefs);
  const t = today();
  const dayRows = useLedgerQuery(
    (db) => (selected ? listTxRows(db, { from: selected, to: selected }) : []),
    [selected]
  );
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
      <View className="flex-row bg-white">
        {weekdayLabels(prefs).map((w, i) => (
          <Text key={w} className="flex-1 py-1 text-center text-xs" style={{ color: w === 'Sun' ? MM.expense : w === 'Sat' ? MM.income : MM.muted }}>
            {w}
          </Text>
        ))}
      </View>
      {grid.map((week) => (
        <View key={week[0].date} className="flex-row bg-white">
          {week.map((d) => {
            const tot = byDay.get(d.date);
            const sel = d.date === selected;
            return (
              <Pressable
                key={d.date}
                onPress={() => setSelected(sel ? null : d.date)}
                onLongPress={() => router.push({ pathname: '/transaction/new', params: { date: d.date } })}
                className="h-16 flex-1 border-r border-t border-gray-100 px-0.5 pt-0.5"
                style={{ backgroundColor: sel ? '#fef2f2' : d.inPeriod ? '#fff' : '#fafafa' }}
              >
                <Text
                  className={`text-xs ${d.date === t ? 'font-bold' : ''}`}
                  style={{ color: d.inPeriod ? (d.date === t ? MM.accent : '#374151') : '#d1d5db' }}
                >
                  {format(parseISO(d.date), 'd')}
                </Text>
                {tot?.income ? <Small value={tot.income} color={MM.income} currency={baseCurrency} /> : null}
                {tot?.expense ? <Small value={tot.expense} color={MM.expense} currency={baseCurrency} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      {selected ? (
        <View className="mt-2">
          <DayHeader date={selected} totals={byDay.get(selected)} currency={baseCurrency} />
          {dayRows.map((r) => (
            <TxListItem key={r.id} row={r} baseCurrency={baseCurrency} onPress={() => router.push(`/transaction/${r.id}`)} />
          ))}
          <Pressable
            onPress={() => router.push({ pathname: '/transaction/new', params: { date: selected } })}
            className="flex-row items-center justify-center gap-1 bg-white py-3"
          >
            <Ionicons name="add" size={18} color={MM.accent} />
            <Text style={{ color: MM.accent }} className="text-sm font-medium">
              Add on this day
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text className="px-4 py-3 text-center text-xs text-gray-400">Tap a day to see it · hold a day to add an entry on it</Text>
      )}
    </ScrollView>
  );
}

function Small({ value, color, currency }: { value: number; color: string; currency: string }) {
  return (
    <Text numberOfLines={1} adjustsFontSizeToFit className="text-right text-[10px]" style={{ color, fontVariant: ['tabular-nums'] }}>
      {formatMoney(value, currency, { code: false })}
    </Text>
  );
}

function PeriodRow({
  title,
  sub,
  income,
  expense,
  currency,
  onPress,
}: {
  title: string;
  sub?: string;
  income: number;
  expense: number;
  currency: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="flex-row items-center border-b border-gray-100 bg-white px-4 py-3 active:bg-gray-50">
      <View className="flex-1">
        <Text className="text-[15px] text-gray-900">{title}</Text>
        {sub ? <Text className="text-xs text-gray-500">{sub}</Text> : null}
      </View>
      <View className="items-end">
        <View className="flex-row gap-3">
          <Amount value={income} currency={currency} tone="income" className="text-sm" />
          <Amount value={expense} currency={currency} tone="expense" className="text-sm" />
        </View>
        <Amount value={income - expense} currency={currency} tone="neutral" className="text-xs" />
      </View>
    </Pressable>
  );
}

function WeeklyView({ period, days }: { period: Period; days: DayTotals[] }) {
  const prefs = usePeriodPrefs();
  const { baseCurrency } = useSettings();
  const weeks = weeksIn(period, prefs).reverse();
  return (
    <FlatList
      data={weeks}
      keyExtractor={(w) => w.from}
      contentContainerStyle={{ paddingBottom: 96 }}
      renderItem={({ item: w }) => {
        const t = sumTotals(days, w.from, w.to);
        return (
          <PeriodRow
            title={`${format(parseISO(w.from), 'MM.dd')} ~ ${format(parseISO(w.to), 'MM.dd')}`}
            income={t.income}
            expense={t.expense}
            currency={baseCurrency}
          />
        );
      }}
    />
  );
}

function MonthlyView({ year, days, onOpen }: { year: Period; days: DayTotals[]; onOpen: (m: Period) => void }) {
  const prefs = usePeriodPrefs();
  const { baseCurrency } = useSettings();
  const months = monthsIn(year, prefs).reverse();
  return (
    <FlatList
      data={months}
      keyExtractor={(m) => m.from}
      contentContainerStyle={{ paddingBottom: 96 }}
      renderItem={({ item: m }) => {
        const t = sumTotals(days, m.from, m.to);
        return (
          <PeriodRow
            title={format(parseISO(prefs.monthStartDay > 15 ? m.to : m.from), 'MMMM')}
            sub={`${format(parseISO(m.from), 'd MMM')} ~ ${format(parseISO(m.to), 'd MMM')}`}
            income={t.income}
            expense={t.expense}
            currency={baseCurrency}
            onPress={() => onOpen(m)}
          />
        );
      }}
    />
  );
}

function SummaryView({ period, income, expense }: { period: Period; income: number; expense: number }) {
  const db = useDb();
  const { baseCurrency } = useSettings();
  const month = format(parseISO(period.to), 'yyyy-MM');
  const data = useLedgerQuery(
    (d) => ({
      byAccount: spendingByAccount(d, period.from, period.to),
      budget: getBudgetSummary(d, period.from, period.to, month),
    }),
    [period.from, period.to, month]
  );
  const b = data.budget;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
      <Card title="Accounts">
        <Line label="Income" value={income} currency={baseCurrency} tone="income" />
        <Line label="Expenses" value={expense} currency={baseCurrency} tone="expense" />
        {data.byAccount.map((a) => (
          <Line key={a.id} label={`  Exp. (${a.name})`} value={a.amount} currency={baseCurrency} />
        ))}
      </Card>
      <Card title="Budget" onPress={() => router.push('/settings/budgets')}>
        {b.totalBudget > 0 ? (
          <>
            <Line label="Total budget" value={b.totalBudget} currency={baseCurrency} />
            <Line label="Spent" value={b.totalSpent} currency={baseCurrency} tone="expense" />
            <View className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <View
                className="h-2 rounded-full"
                style={{ width: `${Math.min(100, b.ratio * 100)}%`, backgroundColor: b.ratio > 1 ? MM.expense : MM.income }}
              />
            </View>
            <Text className="mt-1 text-right text-xs text-gray-500">{`${Math.round(b.ratio * 100)}% used`}</Text>
          </>
        ) : (
          <Text className="text-sm text-gray-500">No budget set. Tap to set monthly budgets.</Text>
        )}
      </Card>
      <Card title="Export">
        <Pressable
          onPress={() => shareTextFile(`ledger-${period.from}-to-${period.to}.csv`, journalCsv(db, period.from, period.to), 'csv')}
          className="flex-row items-center gap-2"
        >
          <Ionicons name="document-text-outline" size={20} color={MM.income} />
          <Text className="text-[15px]" style={{ color: MM.income }}>
            Export this period to CSV (opens in Excel)
          </Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

function Card({ title, children, onPress }: { title: string; children: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="mx-3 mt-3 rounded-xl bg-white p-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-base font-semibold text-gray-900">{title}</Text>
        {onPress ? <Ionicons name="chevron-forward" size={16} color="#9ca3af" /> : null}
      </View>
      {children}
    </Pressable>
  );
}

function Line({ label, value, currency, tone }: { label: string; value: number; currency: string; tone?: 'income' | 'expense' }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-sm text-gray-700">{label}</Text>
      <Amount value={value} currency={currency} tone={tone ?? 'neutral'} className="text-sm" />
    </View>
  );
}

function SearchView({ query, setQuery, baseCurrency }: { query: string; setQuery: (q: string) => void; baseCurrency: string }) {
  const rows = useLedgerQuery(
    (db) => (query.trim().length >= 2 ? listTxRows(db, { from: '1900-01-01', to: '2999-12-31', search: query }) : []),
    [query]
  );
  const sections = useMemo(() => groupByDay(rows), [rows]);
  const total = rows.reduce(
    (s, r) => ({ income: s.income + (r.kind === 'receipt' ? r.amount : 0), expense: s.expense + (r.kind === 'payment' ? r.amount : 0) }),
    { income: 0, expense: 0 }
  );
  return (
    <View className="flex-1">
      <View className="bg-white px-4 py-2">
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder="Search note, description, category or account"
          placeholderTextColor="#9ca3af"
          clearButtonMode="while-editing"
          className="rounded-lg bg-gray-100 px-3 py-2 text-base text-gray-900"
        />
      </View>
      {rows.length ? <TotalsBar income={total.income} expense={total.expense} currency={baseCurrency} /> : null}
      <SectionList
        sections={sections}
        keyExtractor={(r) => String(r.id)}
        renderSectionHeader={({ section }) => <DayHeader date={section.title} currency={baseCurrency} />}
        renderItem={({ item }) => <TxListItem row={item} baseCurrency={baseCurrency} onPress={() => router.push(`/transaction/${item.id}`)} />}
        ListEmptyComponent={<Empty text={query.trim().length >= 2 ? 'Nothing found.' : 'Type at least 2 letters.'} />}
        contentContainerStyle={{ paddingBottom: 48 }}
      />
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <Text className="px-6 py-12 text-center text-sm text-gray-500">{text}</Text>;
}
