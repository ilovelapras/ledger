import React, { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { KIND_LABELS } from '../../domain/accounting';
import { displayDate } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import { buildFormContext } from '../../db/formContext';
import { getTransaction, voidTransaction } from '../../db/transactions';
import { useDb, useMutation, useSettings } from '../../hooks/useLedger';
import { EntryForm } from '../../components/mm/EntryForm';
import { transactionEntryValues } from '../../components/mm/entryValues';
import { MM } from '../../components/mm/theme';

export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const txId = Number(id);
  const db = useDb();
  const mutate = useMutation();
  const { baseCurrency } = useSettings();
  const [photo, setPhoto] = useState<string | null>(null);

  // Loaded once: the form owns the values while editing.
  const loaded = useMemo(() => {
    const tx = getTransaction(db, txId);
    if (!tx) return null;
    return { tx, values: transactionEntryValues(tx, buildFormContext(db)) };
  }, [db, txId]);

  if (!loaded || loaded.tx.status === 'void') {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-gray-500">This transaction was deleted.</Text>
      </View>
    );
  }
  const { tx, values } = loaded;

  const remove = () =>
    Alert.alert('Delete transaction?', 'It is removed from all balances and lists. A record is kept in the audit trail.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (mutate((d) => (voidTransaction(d, txId, 'Deleted'), true), 'Could not delete')) router.back();
        },
      },
    ]);

  const header = (
    <Stack.Screen
      options={{
        title: values ? (values.mode === 'receipt' ? 'Income' : values.mode === 'payment' ? 'Expense' : 'Transfer') : KIND_LABELS[tx.kind],
        headerRight: () => (
          <View className="flex-row items-center gap-5">
            {values ? (
              <Pressable onPress={() => router.push({ pathname: '/transaction/new', params: { copy: String(txId) } })} hitSlop={10} accessibilityLabel="Copy">
                <Ionicons name="copy-outline" size={21} color="#111827" />
              </Pressable>
            ) : null}
            <Pressable onPress={remove} hitSlop={10} accessibilityLabel="Delete">
              <Ionicons name="trash-outline" size={21} color={MM.expense} />
            </Pressable>
          </View>
        ),
      }}
    />
  );

  return (
    <>
      {header}
      {values ? (
        <EntryForm initial={values} editId={txId} onSaved={() => router.back()} onOpenPhoto={setPhoto} />
      ) : (
        // Entered as a multi-line journal (e.g. imported from the earlier version): show it, allow delete.
        <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16 }}>
          <Text className="text-sm text-gray-500">{`${displayDate(tx.date)} · ${tx.reference}`}</Text>
          <Text className="mt-1 text-lg font-semibold text-gray-900">{tx.description || KIND_LABELS[tx.kind]}</Text>
          <Text className="mt-3 text-sm text-gray-600">This entry has several lines, so it can only be viewed or deleted here.</Text>
          {tx.entries.map((e) => (
            <View key={e.id} className="mt-2 flex-row justify-between border-b border-gray-100 py-2">
              <Text className="text-sm text-gray-800">{e.account_name}</Text>
              <Text className="text-sm" style={{ color: e.debit ? MM.expense : MM.income }}>
                {`${e.debit ? 'Dr' : 'Cr'} ${formatMoney(e.debit || e.credit, baseCurrency)}`}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
      <Modal visible={!!photo} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
        <Pressable className="flex-1 items-center justify-center bg-black" onPress={() => setPhoto(null)}>
          {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </>
  );
}
