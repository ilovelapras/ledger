import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Account } from '../../domain/types';
import { listCategories, type CategoryType } from '../../db/categories';
import { listMoneyAccounts } from '../../db/moneyAccounts';
import { groupInfo } from '../../db/seed';
import { useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { MM } from './theme';

export function BottomSheet({
  visible,
  title,
  onClose,
  right,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30" onPress={onClose} accessibilityLabel="Close" />
      <View className="max-h-[70%] rounded-t-2xl bg-white" style={{ paddingBottom: insets.bottom + 8 }}>
        <View className="flex-row items-center justify-between border-b border-gray-200 px-4 py-3">
          <Text className="text-base font-semibold text-gray-900">{title}</Text>
          <View className="flex-row items-center gap-4">
            {right}
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
        </View>
        {children}
      </View>
    </Modal>
  );
}

/** Money Manager category grid: main categories; tapping one with subcategories opens them. */
export function CategorySheet({
  visible,
  type,
  onClose,
  onPick,
  onEdit,
}: {
  visible: boolean;
  type: CategoryType;
  onClose: () => void;
  onPick: (id: number) => void;
  onEdit?: () => void;
}) {
  const groups = useLedgerQuery((db) => listCategories(db, type), [type]);
  const [openId, setOpenId] = useState<number | null>(null);
  const open = groups.find((g) => g.category.id === openId);
  const pick = (id: number) => {
    setOpenId(null);
    onPick(id);
  };
  const close = () => {
    setOpenId(null);
    onClose();
  };
  return (
    <BottomSheet
      visible={visible}
      title={open ? open.category.name : 'Category'}
      onClose={close}
      right={
        open ? (
          <Pressable onPress={() => setOpenId(null)} hitSlop={10}>
            <Text className="text-sm font-medium" style={{ color: MM.accent }}>
              Back
            </Text>
          </Pressable>
        ) : onEdit ? (
          <Pressable onPress={onEdit} hitSlop={10}>
            <Ionicons name="create-outline" size={20} color="#111827" />
          </Pressable>
        ) : null
      }
    >
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {open ? (
          <>
            <Tile icon={open.category.icon} label={`All ${open.category.name}`} onPress={() => pick(open.category.id)} />
            {open.subcategories.map((s) => (
              <Tile key={s.id} icon={s.icon} label={s.name} onPress={() => pick(s.id)} />
            ))}
          </>
        ) : (
          groups.map((g) => (
            <Tile
              key={g.category.id}
              icon={g.category.icon}
              label={g.category.name}
              more={g.subcategories.length > 0}
              onPress={() => (g.subcategories.length ? setOpenId(g.category.id) : pick(g.category.id))}
            />
          ))
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function Tile({ icon, label, onPress, more }: { icon: string | null; label: string; onPress: () => void; more?: boolean }) {
  return (
    <Pressable onPress={onPress} className="w-1/3 items-center border-b border-r border-gray-100 px-1 py-3 active:bg-gray-50">
      <Text className="text-2xl">{icon ?? '•'}</Text>
      <View className="mt-1 flex-row items-center">
        <Text numberOfLines={1} className="text-[13px] text-gray-800">
          {label}
        </Text>
        {more ? <Ionicons name="chevron-forward" size={12} color={MM.muted} /> : null}
      </View>
    </Pressable>
  );
}

/** Money accounts grouped Money Manager style. */
export function AccountSheet({
  visible,
  title = 'Account',
  onClose,
  onPick,
  exclude,
}: {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onPick: (a: Account) => void;
  exclude?: number | null;
}) {
  const accounts = useLedgerQuery((db) => listMoneyAccounts(db), []);
  const { baseCurrency } = useSettings();
  const rows = accounts.filter((a) => a.id !== exclude);
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {rows.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => onPick(a)}
            className="w-1/3 items-center border-b border-r border-gray-100 px-1 py-3 active:bg-gray-50"
          >
            <Text className="text-2xl">{a.icon ?? groupInfo(a.grp).icon}</Text>
            <Text numberOfLines={1} className="mt-1 text-[13px] text-gray-800">
              {a.name}
            </Text>
            <Text className="text-[10px] text-gray-400">
              {groupInfo(a.grp).label}
              {a.currency !== baseCurrency ? ` · ${a.currency}` : ''}
            </Text>
          </Pressable>
        ))}
        {rows.length === 0 ? <Text className="w-full p-6 text-center text-gray-500">Add an account in the Accounts tab first.</Text> : null}
      </ScrollView>
    </BottomSheet>
  );
}

/** Generic single-choice list in a bottom sheet. */
export function ChoiceSheet<V extends string | number>({
  visible,
  title,
  options,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  options: { value: V; label: string; sub?: string }[];
  value: V | null;
  onClose: () => void;
  onPick: (v: V) => void;
}) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <ScrollView>
        {options.map((o) => (
          <Pressable
            key={String(o.value)}
            onPress={() => onPick(o.value)}
            className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3.5 active:bg-gray-50"
          >
            <View>
              <Text className="text-base text-gray-900">{o.label}</Text>
              {o.sub ? <Text className="text-xs text-gray-500">{o.sub}</Text> : null}
            </View>
            {o.value === value ? <Ionicons name="checkmark" size={20} color={MM.accent} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}
