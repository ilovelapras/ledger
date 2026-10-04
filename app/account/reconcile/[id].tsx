import React, { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { displayDate, today } from '../../../domain/dates';
import { formatMoney, parseMoney } from '../../../domain/money';
import { getAccount } from '../../../db/accounts';
import {
  completeReconciliation,
  lastReconciliation,
  listReconciliations,
  reconciledBalance,
  setCleared,
  undoLastReconciliation,
  unreconciledLines,
} from '../../../db/reconcile';
import { useLedgerQuery, useMutation } from '../../../hooks/useLedger';
import { Banner, Button, DateField, EmptyState, Input, MoneyText } from '../../../components/ui';

export default function Reconcile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const mutate = useMutation();
  const [statementDate, setStatementDate] = useState(today());
  const [statementText, setStatementText] = useState('');

  const data = useLedgerQuery(
    (db) => ({
      account: getAccount(db, accountId),
      lines: unreconciledLines(db, accountId, statementDate),
      opening: reconciledBalance(db, accountId),
      last: lastReconciliation(db, accountId),
      history: listReconciliations(db, accountId),
    }),
    [accountId, statementDate]
  );
  const a = data.account;
  if (!a) return <EmptyState title="Account not found" />;
  const cur = a.currency;
  const isLiability = a.type === 'liability';

  const statement = parseMoney(statementText, cur);
  const clearedTotal = data.lines.filter((l) => l.cleared === 'cleared').reduce((s, l) => s + l.amount, 0);
  const clearedBalance = data.opening + clearedTotal;
  const difference = statement == null ? null : statement - clearedBalance;

  const finish = () => {
    if (statement == null) return;
    const ok = mutate((db) => completeReconciliation(db, accountId, statementDate, statement));
    if (ok) {
      Alert.alert('Reconciled', `${a.name} reconciled to ${displayDate(statementDate)}.`);
      router.back();
    }
  };

  const undo = () =>
    Alert.alert('Undo last reconciliation?', `Reopens the reconciliation to ${data.last ? displayDate(data.last.statement_date) : ''}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo', style: 'destructive', onPress: () => mutate((db) => undoLastReconciliation(db, accountId)) },
    ]);

  return (
    <View className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: `Reconcile ${a.name}` }} />
      <FlatList
        data={data.lines}
        keyExtractor={(l) => String(l.entry_id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View className="gap-3 border-b border-gray-200 bg-white p-4">
            <Text className="text-sm text-gray-600">
              Enter the closing balance from your {isLiability ? 'card or loan' : 'bank'} statement, then tick each line that appears on it.
              {isLiability ? ' For cards and loans, enter the amount owed as a positive number.' : ''}
            </Text>
            <View className="flex-row items-end gap-3">
              <View>
                <Text className="mb-1 text-sm font-medium text-gray-700">Statement date</Text>
                <DateField inline value={statementDate} onChange={setStatementDate} />
              </View>
              <View className="flex-1">
                <Input
                  label="Statement balance"
                  value={statementText}
                  onChangeText={setStatementText}
                  placeholder="0.00"
                  keyboardType="numbers-and-punctuation"
                  right={<Text className="text-sm text-gray-500">{cur}</Text>}
                />
              </View>
            </View>
            {data.last ? (
              <Text className="text-xs text-gray-500">
                {`Last reconciled ${displayDate(data.last.statement_date)} at ${formatMoney(data.last.statement_balance, cur)}. `}
                <Text onPress={undo} className="text-primary-700">
                  Undo
                </Text>
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item: l }) => {
          const on = l.cleared === 'cleared';
          return (
            <Pressable
              onPress={() => mutate((db) => setCleared(db, l.entry_id, !on))}
              className={`flex-row items-center border-b border-gray-100 px-4 py-3 ${on ? 'bg-primary-50' : 'bg-white'}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <View className={`mr-3 h-6 w-6 items-center justify-center rounded-md border ${on ? 'border-primary-600 bg-primary-600' : 'border-gray-300'}`}>
                {on ? <Text className="text-xs font-bold text-white">✓</Text> : null}
              </View>
              <View className="mr-2 flex-1">
                <Text numberOfLines={1} className="text-sm text-gray-900">
                  {l.payee_name || l.description || l.reference}
                </Text>
                <Text className="text-xs text-gray-500">{`${displayDate(l.date)} · ${l.reference}`}</Text>
              </View>
              <MoneyText amount={l.amount} currency={cur} colored className="text-sm" />
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyState title="Nothing to reconcile" message="No unreconciled lines on or before this date." />}
        ListFooterComponent={
          data.history.length ? (
            <View className="px-4 pt-4">
              <Text className="mb-1 text-xs font-semibold uppercase text-gray-500">Past reconciliations</Text>
              {data.history.map((h) => (
                <Text key={h.id} className="text-xs text-gray-500">{`${displayDate(h.statement_date)} — ${formatMoney(h.statement_balance, cur)}`}</Text>
              ))}
            </View>
          ) : null
        }
      />
      <View className="gap-2 border-t border-gray-200 bg-white px-4 pb-8 pt-3">
        <Row label="Reconciled balance" amount={data.opening} cur={cur} />
        <Row label="Cleared this time" amount={clearedTotal} cur={cur} />
        <Row label="Cleared balance" amount={clearedBalance} cur={cur} bold />
        {difference != null ? (
          difference === 0 ? (
            <Banner tone="info">✓ Matches the statement.</Banner>
          ) : (
            <Row label="Difference" amount={difference} cur={cur} bold danger />
          )
        ) : null}
        <Button disabled={difference !== 0} onPress={finish}>
          Finish reconciliation
        </Button>
      </View>
    </View>
  );
}

function Row({ label, amount, cur, bold, danger }: { label: string; amount: number; cur: string; bold?: boolean; danger?: boolean }) {
  return (
    <View className="flex-row justify-between">
      <Text className={`text-sm ${bold ? 'font-semibold' : ''} ${danger ? 'text-red-600' : 'text-gray-700'}`}>{label}</Text>
      <MoneyText amount={amount} currency={cur} code className={`text-sm ${bold ? 'font-semibold' : ''} ${danger ? 'text-red-600' : 'text-gray-900'}`} />
    </View>
  );
}
