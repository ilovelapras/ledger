import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { isMoneyAccount, KIND_LABELS } from '../../domain/accounting';
import { displayDate, presetRange, today } from '../../domain/dates';
import { balanceOf, nativeBalanceOf } from '../../domain/reports';
import type { TxKind } from '../../domain/types';
import { listAccounts } from '../../db/accounts';
import { accountTotals, getTrialBalance } from '../../db/reports';
import { listTransactions } from '../../db/transactions';
import { useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { Banner, Button, Card, EmptyState, ListRow, MoneyText, SectionTitle } from '../../components/ui';

const QUICK: { kind: TxKind; icon: SymbolViewProps['name'] }[] = [
  { kind: 'payment', icon: 'arrow.up.right' },
  { kind: 'receipt', icon: 'arrow.down.left' },
  { kind: 'transfer', icon: 'arrow.left.arrow.right' },
  { kind: 'journal', icon: 'square.and.pencil' },
];

export default function Overview() {
  const { baseCurrency, ownerName } = useSettings();
  const month = presetRange('this_month');

  const data = useLedgerQuery((db) => {
    const accounts = listAccounts(db, false);
    const all = accountTotals(db, { to: today() });
    const mtd = accountTotals(db, month);
    let assets = 0;
    let liabilities = 0;
    let income = 0;
    let expense = 0;
    for (const a of accounts) {
      if (a.type === 'asset') assets += balanceOf(a, all);
      if (a.type === 'liability') liabilities += balanceOf(a, all);
      if (a.type === 'income') income += balanceOf(a, mtd);
      if (a.type === 'expense') expense += balanceOf(a, mtd);
    }
    const moneyAccounts = accounts
      .filter((a) => isMoneyAccount(a) && !a.is_placeholder)
      .map((a) => ({ account: a, base: balanceOf(a, all), native: nativeBalanceOf(a, all), used: all.has(a.id) }))
      .filter((x) => x.used || x.base !== 0);
    return {
      assets,
      liabilities,
      income,
      expense,
      moneyAccounts,
      recent: listTransactions(db, { limit: 8 }),
      balanced: getTrialBalance(db, '2999-12-31').balanced,
    };
  }, [month.from]);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ paddingBottom: 32 }}>
      {!data.balanced ? <Banner tone="error">The trial balance is out of balance. Check Reports → Trial Balance.</Banner> : null}

      <View className="mx-4 mt-4 rounded-2xl bg-primary-700 p-5">
        <Text className="text-sm text-primary-100">{ownerName ? `${ownerName} · ` : ''}Net worth</Text>
        <MoneyText amount={data.assets - data.liabilities} currency={baseCurrency} code className="mt-1 text-3xl font-bold text-white" />
        <View className="mt-4 flex-row">
          <View className="flex-1">
            <Text className="text-xs text-primary-100">Assets</Text>
            <MoneyText amount={data.assets} currency={baseCurrency} className="text-base font-semibold text-white" />
          </View>
          <View className="flex-1">
            <Text className="text-xs text-primary-100">Liabilities</Text>
            <MoneyText amount={data.liabilities} currency={baseCurrency} className="text-base font-semibold text-white" />
          </View>
        </View>
      </View>

      <View className="mx-4 mt-4 flex-row gap-2">
        {QUICK.map((q) => (
          <Pressable
            key={q.kind}
            onPress={() => router.push({ pathname: '/transaction/new', params: { mode: q.kind } })}
            className="flex-1 items-center rounded-xl border border-gray-200 bg-white py-3 active:bg-gray-50"
          >
            <SymbolView name={q.icon} tintColor="#15803d" size={20} />
            <Text className="mt-1 text-xs font-medium text-gray-800">{KIND_LABELS[q.kind]}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>This month</SectionTitle>
      <Card className="mx-4">
        <View className="flex-row">
          <Stat label="Income" amount={data.income} currency={baseCurrency} />
          <Stat label="Expenses" amount={data.expense} currency={baseCurrency} />
          <Stat label="Net" amount={data.income - data.expense} currency={baseCurrency} colored />
        </View>
      </Card>

      <SectionTitle right={<Text onPress={() => router.push('/accounts')} className="text-sm font-medium text-primary-700">All</Text>}>
        Bank, cash & cards
      </SectionTitle>
      <View className="mx-4 overflow-hidden rounded-xl border border-gray-200">
        {data.moneyAccounts.length === 0 ? (
          <View className="bg-white">
            <EmptyState
              title="No balances yet"
              message="Enter what's in your bank accounts and what you owe on cards and loans."
              action={<Button onPress={() => router.push('/opening')}>Enter opening balances</Button>}
            />
          </View>
        ) : (
          data.moneyAccounts.map(({ account, base, native }) => (
            <ListRow
              key={account.id}
              title={account.name}
              subtitle={account.institution ?? account.code}
              onPress={() => router.push(`/account/${account.id}`)}
              right={
                <View className="items-end">
                  <MoneyText amount={native} currency={account.currency} code={account.currency !== baseCurrency} colored className="text-base font-medium" />
                  {account.currency !== baseCurrency ? <MoneyText amount={base} currency={baseCurrency} code className="text-xs text-gray-500" /> : null}
                </View>
              }
            />
          ))
        )}
      </View>

      <SectionTitle right={<Text onPress={() => router.push('/transactions')} className="text-sm font-medium text-primary-700">All</Text>}>
        Recent transactions
      </SectionTitle>
      <View className="mx-4 overflow-hidden rounded-xl border border-gray-200">
        {data.recent.length === 0 ? (
          <View className="bg-white">
            <EmptyState title="Nothing recorded yet" message="Tap + to record a payment, receipt or transfer." />
          </View>
        ) : (
          data.recent.map((t) => (
            <ListRow
              key={t.id}
              title={t.payee_name || t.description || KIND_LABELS[t.kind]}
              subtitle={`${displayDate(t.date)} · ${t.reference} · ${t.accounts}`}
              onPress={() => router.push(`/transaction/${t.id}`)}
              right={<MoneyText amount={t.amount} currency={baseCurrency} className="text-base text-gray-900" />}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ label, amount, currency, colored }: { label: string; amount: number; currency: string; colored?: boolean }) {
  return (
    <View className="flex-1">
      <Text className="text-xs text-gray-500">{label}</Text>
      <MoneyText amount={amount} currency={currency} colored={colored} className="text-base font-semibold text-gray-900" />
    </View>
  );
}
