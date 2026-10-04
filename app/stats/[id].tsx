import React from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { displayDate } from '../../domain/dates';
import { currencyDecimals } from '../../domain/money';
import { periodContaining, shiftPeriod } from '../../domain/periods';
import { getAccount } from '../../db/accounts';
import { categoryTotals, listTxRows } from '../../db/stats';
import { useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { Amount, TxListItem, usePeriodPrefs } from '../../components/mm/Common';
import { BarChart, compact, PercentBadge } from '../../components/mm/Charts';
import { MM } from '../../components/mm/theme';

/** Category drill-down: subcategories, 6-month trend, transactions. */
export default function CategoryStats() {
  const p = useLocalSearchParams<{ id: string; from: string; to: string; type: string }>();
  const id = Number(p.id);
  const type = p.type === 'income' ? 'income' : 'expense';
  const prefs = usePeriodPrefs();
  const { baseCurrency } = useSettings();
  const { width } = useWindowDimensions();

  const data = useLedgerQuery(
    (db) => {
      const cat = getAccount(db, id);
      const subs = categoryTotals(db, type, p.from, p.to, id);
      // Six months ending with the selected period's month.
      let m = periodContaining('month', p.to, prefs);
      const months = [];
      for (let i = 0; i < 6; i++) {
        months.unshift(m);
        m = shiftPeriod(m, -1, prefs);
      }
      const trend = months.map((mm) => ({
        label: format(parseISO(prefs.monthStartDay > 15 ? mm.to : mm.from), 'MMM'),
        value: categoryTotals(db, type, mm.from, mm.to).find((c) => c.id === id)?.amount ?? 0,
      }));
      const rows = listTxRows(db, { from: p.from, to: p.to, categoryId: id });
      return { cat, subs, trend, rows };
    },
    [id, p.from, p.to, type]
  );
  const total = data.subs.reduce((s, r) => s + r.amount, 0);
  const color = type === 'income' ? MM.income : MM.expense;

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: MM.bg }} contentContainerStyle={{ paddingBottom: 32 }}>
      <Stack.Screen options={{ title: data.cat ? `${data.cat.icon ?? ''} ${data.cat.name}` : 'Category' }} />
      <View className="bg-white px-4 py-3">
        <Text className="text-xs text-gray-500">{`${displayDate(p.from)} – ${displayDate(p.to)}`}</Text>
        <Amount value={total} currency={baseCurrency} tone={type} className="mt-1 text-2xl font-bold" />
      </View>

      {data.subs.length > 1 || (data.subs.length === 1 && data.subs[0].id !== id) ? (
        <View className="mt-2">
          {data.subs.map((s, i) => (
            <View key={s.id} className="flex-row items-center border-b border-gray-100 bg-white px-4 py-3">
              <PercentBadge share={total ? s.amount / total : 0} index={i} />
              <Text className="flex-1 text-[15px] text-gray-900">{s.id === id ? `${s.name} (general)` : `${s.icon ?? ''} ${s.name}`}</Text>
              <Amount value={s.amount} currency={baseCurrency} tone="neutral" className="text-[15px]" />
            </View>
          ))}
        </View>
      ) : null}

      <View className="mt-2 bg-white py-3">
        <Text className="px-4 pb-2 text-sm font-semibold text-gray-900">Last 6 months</Text>
        <BarChart
          data={data.trend}
          color={color}
          width={Math.min(width - 16, 420)}
          format={(v) => compact(v, currencyDecimals(baseCurrency))}
        />
      </View>

      <Text className="px-4 pb-1 pt-4 text-xs font-semibold uppercase text-gray-500">Transactions</Text>
      {data.rows.map((r) => (
        <TxListItem key={r.id} row={r} baseCurrency={baseCurrency} onPress={() => router.push(`/transaction/${r.id}`)} />
      ))}
      {data.rows.length === 0 ? (
        <Pressable onPress={() => router.back()}>
          <Text className="py-8 text-center text-sm text-gray-500">No transactions.</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
