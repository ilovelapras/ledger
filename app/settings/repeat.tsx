import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { displayDate } from '../../domain/dates';
import { FREQ_LABELS } from '../../domain/recurrence';
import { deleteRecurrence, listRecurrences, stopRecurrence } from '../../db/recurrences';
import { useLedgerQuery, useMutation } from '../../hooks/useLedger';
import { MM } from '../../components/mm/theme';

const KIND = { payment: 'Expense', receipt: 'Income', transfer: 'Transfer' } as const;

export default function RepeatSettings() {
  const rows = useLedgerQuery(listRecurrences, []);
  const mutate = useMutation();

  const manage = (id: number, active: boolean, title: string) =>
    Alert.alert(title, 'Transactions already recorded are kept.', [
      { text: 'Cancel', style: 'cancel' },
      ...(active ? [{ text: 'Stop repeating', onPress: () => mutate((db) => stopRecurrence(db, id)) }] : []),
      { text: 'Delete schedule', style: 'destructive' as const, onPress: () => mutate((db) => deleteRecurrence(db, id)) },
    ]);

  return (
    <ScrollView style={{ backgroundColor: MM.bg }} contentContainerStyle={{ paddingBottom: 32 }}>
      {rows.map((r) => {
        const title = r.description || KIND[r.kind];
        return (
          <Pressable key={r.id} onPress={() => manage(r.id, !!r.active, title)} className="border-b border-gray-100 bg-white px-4 py-3 active:bg-gray-50">
            <View className="flex-row items-center justify-between">
              <Text className={`text-[15px] ${r.active ? 'text-gray-900' : 'text-gray-400'}`}>{title}</Text>
              <Text className="text-[15px]" style={{ color: r.kind === 'receipt' ? MM.income : r.kind === 'payment' ? MM.expense : MM.transfer }}>
                {r.amount}
              </Text>
            </View>
            <Text className="mt-0.5 text-xs text-gray-500">
              {`${KIND[r.kind]} · ${FREQ_LABELS[r.freq]} · from ${displayDate(r.start_date)}${r.end_date ? ` to ${displayDate(r.end_date)}` : ''}`}
            </Text>
            <Text className="text-xs" style={{ color: r.next_date ? MM.income : MM.muted }}>
              {r.next_date ? `Next: ${displayDate(r.next_date)}` : 'Stopped'}
            </Text>
          </Pressable>
        );
      })}
      {rows.length === 0 ? (
        <Text className="px-8 py-12 text-center text-sm text-gray-500">
          No repeating transactions. When adding an entry, set Repeat (e.g. every month) and it will be recorded automatically on each date when you open the app.
        </Text>
      ) : null}
    </ScrollView>
  );
}
