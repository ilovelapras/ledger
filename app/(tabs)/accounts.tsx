import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { today } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import { getCardStatus, moneyAccountBalances, type MoneyAccountBalance } from '../../db/moneyAccounts';
import { ACCOUNT_GROUPS, groupInfo } from '../../db/seed';
import { useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { Amount } from '../../components/mm/Common';
import { MM } from '../../components/mm/theme';

export default function Accounts() {
  const { baseCurrency } = useSettings();
  const t = today();
  const data = useLedgerQuery(
    (db) => {
      const balances = moneyAccountBalances(db, t);
      const cards = new Map(balances.filter((b) => b.account.grp === 'card').map((b) => [b.account.id, getCardStatus(db, b.account.id, t)]));
      return { balances, cards };
    },
    [t]
  );

  const { groups, assets, liabilities } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    const byGroup = new Map<string, MoneyAccountBalance[]>();
    for (const b of data.balances) {
      if (b.account.include_in_totals) {
        if (b.account.type === 'asset') assets += b.base;
        else liabilities += b.base;
      }
      const key = groupInfo(b.account.grp).key;
      byGroup.set(key, [...(byGroup.get(key) ?? []), b]);
    }
    const groups = ACCOUNT_GROUPS.filter((g) => byGroup.has(g.key)).map((g) => ({ group: g, items: byGroup.get(g.key)! }));
    return { groups, assets, liabilities };
  }, [data.balances]);

  return (
    <View className="flex-1" style={{ backgroundColor: MM.bg }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/account/edit')} hitSlop={10} className="px-4" accessibilityLabel="Add account">
              <Ionicons name="add" size={26} color="#111827" />
            </Pressable>
          ),
        }}
      />
      <View className="flex-row border-b border-gray-200 bg-white py-3">
        <Head label="Assets" value={assets} color={MM.income} currency={baseCurrency} />
        <Head label="Liabilities" value={liabilities} color={MM.expense} currency={baseCurrency} />
        <Head label="Total" value={assets - liabilities} color="#111827" currency={baseCurrency} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {groups.map(({ group, items }) => {
          const sum = items.reduce((s, b) => s + b.base, 0);
          return (
            <View key={group.key} className="mt-2">
              <View className="flex-row items-center justify-between px-4 py-2">
                <Text className="text-sm font-semibold text-gray-600">{group.label}</Text>
                <Text className="text-sm" style={{ color: group.type === 'liability' ? MM.expense : MM.income, fontVariant: ['tabular-nums'] }}>
                  {formatMoney(group.type === 'liability' ? -sum : sum, baseCurrency, { code: false, parens: false })}
                </Text>
              </View>
              {items.map((b) => {
                const card = data.cards.get(b.account.id);
                const foreign = b.account.currency !== baseCurrency;
                const shown = b.account.type === 'liability' ? -b.native : b.native;
                return (
                  <Pressable
                    key={b.account.id}
                    onPress={() => router.push(`/account/${b.account.id}`)}
                    onLongPress={() => router.push({ pathname: '/account/edit', params: { id: String(b.account.id) } })}
                    className="flex-row items-center border-b border-gray-100 bg-white px-4 py-3 active:bg-gray-50"
                  >
                    <Text className="mr-3 text-xl">{b.account.icon ?? group.icon}</Text>
                    <View className="flex-1">
                      <Text className="text-[15px] text-gray-900">{b.account.name}</Text>
                      {card ? (
                        <Text className="text-xs text-gray-500">
                          {`Payable ${formatMoney(card.payable, b.account.currency, { code: false })}${card.dueDate ? ` · due ${card.dueDate.slice(5).replace('-', '/')}` : ''}`}
                        </Text>
                      ) : !b.account.include_in_totals ? (
                        <Text className="text-xs text-gray-400">Not in totals</Text>
                      ) : null}
                    </View>
                    <View className="items-end">
                      <Amount
                        value={shown}
                        currency={b.account.currency}
                        tone={shown < 0 ? 'expense' : 'income'}
                        className="text-[15px]"
                      />
                      {foreign ? <Text className="text-[11px] text-gray-400">{`${b.account.currency} · ${formatMoney(b.base, baseCurrency, { parens: false })}`}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
        {groups.length === 0 ? <Text className="py-12 text-center text-sm text-gray-500">No accounts yet. Tap + to add one.</Text> : null}
        <Text className="px-4 pt-4 text-center text-xs text-gray-400">Hold an account to edit it</Text>
      </ScrollView>
    </View>
  );
}

function Head({ label, value, color, currency }: { label: string; value: number; color: string; currency: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text className="text-base font-semibold" style={{ color, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {formatMoney(value, currency, { code: false, parens: false })}
      </Text>
    </View>
  );
}
