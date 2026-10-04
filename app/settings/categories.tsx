import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Account } from '../../domain/types';
import { createCategory, listCategories, moveCategory, removeCategory, restoreCategory, updateCategory } from '../../db/categories';
import { useLedgerQuery, useMutation } from '../../hooks/useLedger';
import { MM } from '../../components/mm/theme';

interface Editing {
  id: number | null;
  parentId: number | null;
  name: string;
  icon: string;
}

export default function CategorySettings() {
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const type = typeParam === 'income' ? 'income' : 'expense';
  const mutate = useMutation();
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const groups = useLedgerQuery((db) => listCategories(db, type, showHidden), [type, showHidden]);

  const save = () => {
    if (!editing) return;
    const ok = mutate((db) => {
      const icon = editing.icon.trim() || null;
      if (editing.id) updateCategory(db, editing.id, { name: editing.name, icon });
      else createCategory(db, { type, name: editing.name, icon, parentId: editing.parentId });
      return true;
    });
    if (ok) setEditing(null);
  };

  const remove = (a: Account) =>
    Alert.alert(`Remove "${a.name}"?`, 'Categories with transactions are hidden (history kept); unused ones are deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const r = mutate((db) => removeCategory(db, a.id));
          if (r === 'hidden') Alert.alert('Hidden', `"${a.name}" has transactions, so it was hidden. Turn on "Show hidden" to restore it.`);
        },
      },
    ]);

  const row = (a: Account, sub: boolean) => (
    <View key={a.id} className="flex-row items-center border-b border-gray-100 bg-white py-3 pr-2" style={{ paddingLeft: sub ? 44 : 16 }}>
      <Pressable onPress={() => setEditing({ id: a.id, parentId: a.parent_id, name: a.name, icon: a.icon ?? '' })} className="flex-1 flex-row items-center">
        <Text className="mr-2 text-lg">{a.icon ?? '•'}</Text>
        <Text className={`text-[15px] ${a.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{a.name}</Text>
      </Pressable>
      {a.is_active ? (
        <>
          <IconBtn name="chevron-up" onPress={() => mutate((db) => moveCategory(db, a.id, -1))} label="Move up" />
          <IconBtn name="chevron-down" onPress={() => mutate((db) => moveCategory(db, a.id, 1))} label="Move down" />
          <IconBtn name="remove-circle-outline" color={MM.expense} onPress={() => remove(a)} label="Remove" />
        </>
      ) : (
        <Pressable onPress={() => mutate((db) => restoreCategory(db, a.id))} className="px-2">
          <Text className="text-sm" style={{ color: MM.income }}>
            Restore
          </Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: MM.bg }}>
      <Stack.Screen
        options={{
          title: type === 'income' ? 'Income categories' : 'Expense categories',
          headerRight: () => (
            <Pressable onPress={() => setEditing({ id: null, parentId: null, name: '', icon: '' })} hitSlop={10} accessibilityLabel="Add category">
              <Ionicons name="add" size={26} color="#111827" />
            </Pressable>
          ),
        }}
      />
      <View className="flex-row items-center justify-between bg-white px-4 py-2">
        <Text className="text-sm text-gray-600">Show hidden</Text>
        <Switch value={showHidden} onValueChange={setShowHidden} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {groups.map((g) => (
          <View key={g.category.id} className="mt-1">
            {row(g.category, false)}
            {g.subcategories.map((s) => row(s, true))}
            {g.category.is_active ? (
              <Pressable
                onPress={() => setEditing({ id: null, parentId: g.category.id, name: '', icon: '' })}
                className="border-b border-gray-100 bg-white py-2.5"
                style={{ paddingLeft: 44 }}
              >
                <Text className="text-sm" style={{ color: MM.income }}>{`+ Subcategory of ${g.category.name}`}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-8">
          <View className="w-full rounded-2xl bg-white p-5">
            <Text className="text-lg font-semibold text-gray-900">
              {editing?.id ? 'Edit category' : editing?.parentId ? 'New subcategory' : 'New category'}
            </Text>
            <View className="mt-3 flex-row gap-2">
              <TextInput
                value={editing?.icon ?? ''}
                onChangeText={(icon) => editing && setEditing({ ...editing, icon })}
                placeholder="🙂"
                maxLength={8}
                className="w-14 rounded-lg border border-gray-300 text-center text-xl"
              />
              <TextInput
                value={editing?.name ?? ''}
                onChangeText={(name) => editing && setEditing({ ...editing, name })}
                placeholder="Name"
                placeholderTextColor="#9ca3af"
                autoFocus
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900"
                onSubmitEditing={save}
              />
            </View>
            <Text className="mt-2 text-xs text-gray-500">Tip: use the emoji keyboard for the icon.</Text>
            <View className="mt-4 flex-row justify-end gap-6">
              <Pressable onPress={() => setEditing(null)} hitSlop={8}>
                <Text className="text-base text-gray-600">Cancel</Text>
              </Pressable>
              <Pressable onPress={save} hitSlop={8}>
                <Text className="text-base font-semibold" style={{ color: MM.income }}>
                  Save
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function IconBtn({ name, onPress, color = '#6b7280', label }: { name: 'chevron-up' | 'chevron-down' | 'remove-circle-outline'; onPress: () => void; color?: string; label: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} className="px-2" accessibilityLabel={label}>
      <Ionicons name={name} size={20} color={color} />
    </Pressable>
  );
}
