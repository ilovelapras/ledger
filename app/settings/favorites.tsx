import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { deleteFavorite, listFavorites, renameFavorite } from '../../db/favorites';
import { useLedgerQuery, useMutation } from '../../hooks/useLedger';
import { PromptModal } from '../../components/mm/PromptModal';
import { MM } from '../../components/mm/theme';

const KIND = { payment: 'Expense', receipt: 'Income', transfer: 'Transfer' } as const;

export default function Favorites() {
  const favorites = useLedgerQuery(listFavorites, []);
  const mutate = useMutation();
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

  return (
    <View className="flex-1" style={{ backgroundColor: MM.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {favorites.map((f) => (
          <View key={f.id} className="flex-row items-center border-b border-gray-100 bg-white px-4 py-3">
            <Pressable onPress={() => router.push({ pathname: '/transaction/new', params: { favorite: String(f.id) } })} className="flex-1">
              <Text className="text-[15px] text-gray-900">{f.name}</Text>
              <Text className="text-xs" style={{ color: f.kind === 'receipt' ? MM.income : f.kind === 'payment' ? MM.expense : MM.transfer }}>
                {`${KIND[f.kind]}${f.template.lines?.[0]?.amount || f.template.sent ? ` · ${f.template.mode === 'transfer' ? f.template.sent : f.template.lines[0].amount}` : ''}`}
              </Text>
            </Pressable>
            <Pressable onPress={() => setRenaming({ id: f.id, name: f.name })} hitSlop={8} className="px-2" accessibilityLabel="Rename">
              <Ionicons name="create-outline" size={20} color="#6b7280" />
            </Pressable>
            <Pressable
              onPress={() =>
                Alert.alert(`Delete "${f.name}"?`, undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => mutate((db) => deleteFavorite(db, f.id)) },
                ])
              }
              hitSlop={8}
              className="px-2"
              accessibilityLabel="Delete"
            >
              <Ionicons name="trash-outline" size={20} color={MM.expense} />
            </Pressable>
          </View>
        ))}
        {favorites.length === 0 ? (
          <Text className="px-8 py-12 text-center text-sm text-gray-500">
            No favourites yet. While adding an entry, tap the ☆ at the top right and choose "Save this entry as a favourite".
          </Text>
        ) : (
          <Text className="px-6 pt-3 text-xs text-gray-500">Tap a favourite to start a new entry from it.</Text>
        )}
      </ScrollView>
      <PromptModal
        visible={!!renaming}
        title="Rename favourite"
        initial={renaming?.name ?? ''}
        confirmLabel="Save"
        onCancel={() => setRenaming(null)}
        onSubmit={(name) => {
          if (renaming && mutate((db) => (renameFavorite(db, renaming.id, name), true))) setRenaming(null);
        }}
      />
    </View>
  );
}
