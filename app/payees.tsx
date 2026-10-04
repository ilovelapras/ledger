import React, { useState } from 'react';
import { Alert, FlatList, Modal, Text, TextInput, View } from 'react-native';
import type { Payee } from '../domain/types';
import { deletePayee, listPayees, updatePayee } from '../db/payees';
import { useLedgerQuery, useMutation } from '../hooks/useLedger';
import { AccountPicker, useAccountMap } from '../components/AccountPicker';
import { Button, EmptyState, Input, ListRow } from '../components/ui';

export default function Payees() {
  const payees = useLedgerQuery(listPayees, []);
  const accounts = useAccountMap();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Payee | null>(null);
  const q = query.trim().toLowerCase();
  const shown = q ? payees.filter((p) => p.name.toLowerCase().includes(q)) : payees;

  return (
    <View className="flex-1 bg-gray-50">
      <View className="border-b border-gray-200 bg-white px-4 py-2">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search payees"
          placeholderTextColor="#9ca3af"
          clearButtonMode="while-editing"
          className="rounded-lg bg-gray-100 px-3 py-2 text-base text-gray-900"
        />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item: p }) => (
          <ListRow
            title={p.name}
            subtitle={`${p.tx_count} transaction${p.tx_count === 1 ? '' : 's'}${
              p.default_account_id ? ` · usually ${accounts.get(p.default_account_id)?.name ?? ''}` : ''
            }`}
            onPress={() => setEditing(p)}
          />
        )}
        ListEmptyComponent={<EmptyState title="No payees yet" message="Payees are added as you record payments and receipts." />}
      />
      {editing ? <PayeeEditor payee={editing} onClose={() => setEditing(null)} /> : null}
    </View>
  );
}

function PayeeEditor({ payee, onClose }: { payee: Payee; onClose: () => void }) {
  const mutate = useMutation();
  const [name, setName] = useState(payee.name);
  const [accountId, setAccountId] = useState<number | null>(payee.default_account_id);
  const [notes, setNotes] = useState(payee.notes ?? '');

  const save = () => {
    if (mutate((d) => (updatePayee(d, payee.id, name, accountId, notes), true))) onClose();
  };
  const remove = () =>
    Alert.alert('Delete payee?', 'Existing transactions are kept but will no longer show this payee.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (mutate((d) => (deletePayee(d, payee.id), true))) onClose();
        },
      },
    ]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 gap-4 bg-gray-50 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-semibold text-gray-900">Edit payee</Text>
          <Text onPress={onClose} className="text-base font-semibold text-primary-700">
            Cancel
          </Text>
        </View>
        <Input label="Name" value={name} onChangeText={setName} />
        <View>
          <AccountPicker label="Default category" value={accountId} onChange={setAccountId} placeholder="None" />
          {accountId != null ? (
            <Text onPress={() => setAccountId(null)} className="mt-1 text-sm text-primary-700">
              Clear default
            </Text>
          ) : null}
        </View>
        <Input label="Notes" value={notes} onChangeText={setNotes} multiline className="min-h-[64px]" />
        <Button onPress={save}>Save</Button>
        <Button variant="ghost" onPress={remove}>
          <Text className="font-semibold text-red-600">Delete payee</Text>
        </Button>
      </View>
    </Modal>
  );
}
