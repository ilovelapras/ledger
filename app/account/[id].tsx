import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { displayDate, today } from '../../domain/dates';
import { formatMoney, toDecimalString } from '../../domain/money';
import { periodContaining, shiftPeriod } from '../../domain/periods';
import { getAccountLedger } from '../../db/reports';
import { getCardStatus } from '../../db/moneyAccounts';
import { listTxRows } from '../../db/stats';
import { groupInfo } from '../../db/seed';
import { useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { Amount, categoryLabel, PeriodHeader, usePeriodPrefs } from '../../components/mm/Common';
import { MM } from '../../components/mm/theme';

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const prefs = usePeriodPrefs();
  const { baseCurrency } = useSettings();
  const [anchor, setAnchor] = useState(today());
  const insets = useSafeAreaInsets();
  const period = periodContaining('month', anchor, prefs);

  const data = useLedgerQuery(
    (db) => ({
      ledger: getAccountLedger(db, accountId, period.from, period.to),
      now: getAccountLedger(db, accountId, today(), today()),
      card: getCardStatus(db, accountId, today()),
      rows: listTxRows(db, { from: period.from, to: period.to, accountId }),
    }),
    [accountId, period.from, period.to]
  );
  const rowById = useMemo(() => new Map(data.rows.map((r) => [r.id, r])), [data.rows]);
  const l = data.ledger;
  if (!l || !data.now) return <Text className="p-6 text-gray-500">Account not found.</Text>;
  const a = l.account;
  const cur = a.currency;
  // Liabilities read as negative, like Money Manager.
  const sign = a.type === 'liability' ? -1 : 1;
  const balanceNow = sign * data.now.closingNative;
  const lines = [...l.lines].reverse();
  const card = data.card;

  return (
    <View className="flex-1" style={{ backgroundColor: MM.bg }}>
      <Stack.Screen
        options={{
          title: a.name,
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/account/edit', params: { id: String(a.id) } })} hitSlop={10}>
              <Text className="text-base font-medium" style={{ color: MM.accent }}>
                Edit
              </Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={lines}
        keyExtractor={(x) => String(x.entry_id)}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListHeaderComponent={
          <>
            <View className="bg-white px-4 py-4">
              <Text className="text-xs text-gray-500">{`${groupInfo(a.grp).label}${cur !== baseCurrency ? ` · ${cur}` : ''}`}</Text>
              <Amount value={balanceNow} currency={cur} tone={balanceNow < 0 ? 'expense' : 'income'} className="text-3xl font-bold" />
              {cur !== baseCurrency ? (
                <Text className="text-sm text-gray-500">{formatMoney(sign * data.now.closingBase, baseCurrency, { parens: false })}</Text>
              ) : null}
              {card ? (
                <View className="mt-3 rounded-lg bg-gray-50 p-3">
                  <Row label="Balance payable" value={formatMoney(card.payable, cur, { code: false })} strong />
                  <Row label="Outstanding balance" value={formatMoney(card.outstanding, cur, { code: false })} />
                  <Row label="Last statement" value={displayDate(card.lastClose)} />
                  {card.dueDate ? <Row label="Payment due" value={displayDate(card.dueDate)} /> : null}
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/transaction/new',
                        params: {
                          mode: 'transfer',
                          ...(a.payment_account_id ? { accountId: String(a.payment_account_id) } : {}),
                          toId: String(a.id),
                          ...(card.payable > 0 ? { amount: toDecimalString(card.payable, cur) } : {}),
                        },
                      })
                    }
                    className="mt-2 items-center rounded-lg py-2"
                    style={{ backgroundColor: MM.accent }}
                  >
                    <Text className="text-sm font-semibold text-white">Pay card</Text>
                  </Pressable>
                </View>
              ) : a.grp === 'card' ? (
                <Text className="mt-2 text-xs text-gray-500">Set a statement day in Edit to see what's payable.</Text>
              ) : null}
            </View>
            <PeriodHeader period={period} onShift={(n) => setAnchor(shiftPeriod(period, n, prefs).from)} />
            <View className="flex-row border-y border-gray-200 bg-white px-4 py-2">
              <Text className="flex-1 text-xs text-gray-500">{`Opening ${formatMoney(sign * l.openingNative, cur, { code: false, parens: false })}`}</Text>
              <Text className="text-xs text-gray-500">{`Closing ${formatMoney(sign * l.closingNative, cur, { code: false, parens: false })}`}</Text>
            </View>
          </>
        }
        renderItem={({ item: x }) => {
          const r = rowById.get(x.transaction_id);
          const signed = sign * x.nativeAmount;
          return (
            <Pressable
              onPress={() => router.push(`/transaction/${x.transaction_id}`)}
              className="flex-row items-center border-b border-gray-100 bg-white px-4 py-2.5 active:bg-gray-50"
            >
              <View className="w-12">
                <Text className="text-base font-semibold text-gray-900">{format(parseISO(x.date), 'd')}</Text>
                <Text className="text-[10px] text-gray-500">{format(parseISO(x.date), 'EEE')}</Text>
              </View>
              <View className="mr-2 flex-1">
                <Text numberOfLines={1} className="text-[15px] text-gray-900">
                  {x.description || (r ? categoryLabel(r) : x.reference)}
                </Text>
                <Text numberOfLines={1} className="text-xs text-gray-500">
                  {r ? (r.kind === 'transfer' ? `${r.account_name} → ${r.category_name ?? ''}` : `${r.category_icon ?? ''} ${r.category_name ?? ''}`) : x.reference}
                </Text>
              </View>
              <View className="items-end">
                <Amount value={signed} currency={cur} tone={signed < 0 ? 'expense' : 'income'} className="text-[15px]" />
                <Text className="text-[11px] text-gray-400" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatMoney(sign * x.nativeBalance, cur, { code: false, parens: false })}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text className="py-10 text-center text-sm text-gray-500">No transactions this month.</Text>}
      />
      <Pressable
        onPress={() => router.push({ pathname: '/transaction/new', params: { accountId: String(a.id) } })}
        accessibilityLabel="Add transaction"
        className="absolute right-5 h-14 w-14 items-center justify-center rounded-full"
        style={{ bottom: 24 + insets.bottom, backgroundColor: MM.accent, elevation: 6 }}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between py-0.5">
      <Text className={`text-sm ${strong ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{label}</Text>
      <Text className={`text-sm ${strong ? 'font-semibold' : ''}`} style={{ color: strong ? MM.expense : '#374151', fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}
