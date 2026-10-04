import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FieldHint, FieldLabel } from './Input';

export interface SelectOption<V extends string | number = string | number> {
  value: V;
  label: string;
  sublabel?: string;
  /** Indentation level for hierarchical lists. */
  depth?: number;
  /** Shown but not selectable (e.g. header accounts). */
  disabled?: boolean;
}

interface SelectProps<V extends string | number> {
  options: SelectOption<V>[];
  value: V | null | undefined;
  onChange: (value: V) => void;
  placeholder?: string;
  label?: string;
  title?: string;
  error?: string;
  helperText?: string;
  searchable?: boolean;
  disabled?: boolean;
  /** Offer "Add “text”" when the search has no exact match. */
  onCreate?: (text: string) => void;
  /** Render the closed control compactly (no border box). */
  compact?: boolean;
}

export function Select<V extends string | number>({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  label,
  title,
  error,
  helperText,
  searchable = true,
  disabled,
  onCreate,
  compact,
}: SelectProps<V>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sublabel ?? '').toLowerCase().includes(q)
    );
  }, [options, query]);

  const exact = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View className="w-full">
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        className={
          compact
            ? 'flex-row items-center justify-between py-1'
            : `flex-row items-center justify-between rounded-lg border px-3 py-3 ${
                error ? 'border-red-500' : 'border-gray-300'
              } ${disabled ? 'bg-gray-100' : 'bg-white'}`
        }
      >
        <Text numberOfLines={1} className={`flex-1 text-base ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected?.label ?? placeholder}
        </Text>
        <Text className="ml-2 text-gray-400">⌄</Text>
      </Pressable>
      <FieldHint error={error} helperText={helperText} />

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <View className="flex-1 bg-white" style={{ paddingBottom: insets.bottom }}>
          <View className="flex-row items-center justify-between border-b border-gray-200 px-4 py-3">
            <Text className="text-lg font-semibold text-gray-900">{title ?? label ?? 'Select'}</Text>
            <Pressable onPress={close} hitSlop={12}>
              <Text className="text-base font-semibold text-primary-700">Done</Text>
            </Pressable>
          </View>
          {searchable ? (
            <View className="border-b border-gray-100 px-4 py-2">
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor="#9ca3af"
                autoFocus
                autoCorrect={false}
                clearButtonMode="while-editing"
                className="rounded-lg bg-gray-100 px-3 py-2 text-base text-gray-900"
              />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(o) => String(o.value)}
            ListHeaderComponent={
              onCreate && query.trim() && !exact ? (
                <Pressable
                  onPress={() => {
                    onCreate(query.trim());
                    close();
                  }}
                  className="border-b border-gray-100 px-4 py-3 active:bg-gray-50"
                >
                  <Text className="text-base font-medium text-primary-700">Add “{query.trim()}”</Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              !onCreate ? <Text className="px-4 py-8 text-center text-gray-500">No matches</Text> : null
            }
            renderItem={({ item }) => {
              const isSel = item.value === value;
              return (
                <Pressable
                  disabled={item.disabled}
                  onPress={() => {
                    onChange(item.value);
                    close();
                  }}
                  className={`flex-row items-center border-b border-gray-100 py-3 pr-4 active:bg-gray-50 ${
                    isSel ? 'bg-primary-50' : ''
                  }`}
                  style={{ paddingLeft: 16 + (item.depth ?? 0) * 16 }}
                >
                  <View className="flex-1">
                    <Text
                      className={`text-base ${
                        item.disabled ? 'font-semibold text-gray-500' : isSel ? 'font-semibold text-primary-700' : 'text-gray-900'
                      }`}
                    >
                      {item.label}
                    </Text>
                    {item.sublabel ? <Text className="text-xs text-gray-500">{item.sublabel}</Text> : null}
                  </View>
                  {isSel ? <Text className="text-primary-700">✓</Text> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
