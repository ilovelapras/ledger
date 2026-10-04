import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { MM } from './theme';

/** Cross-platform text prompt (Alert.prompt is iOS-only). */
export function PromptModal({
  visible,
  title,
  message,
  initial = '',
  placeholder,
  confirmLabel = 'OK',
  destructive,
  keyboardType = 'default',
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  message?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  destructive?: boolean;
  keyboardType?: 'default' | 'decimal-pad';
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40 px-8">
        <View className="w-full rounded-2xl bg-white p-5">
          <Text className="text-lg font-semibold text-gray-900">{title}</Text>
          {message ? <Text className="mt-1 text-sm text-gray-600">{message}</Text> : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor="#9ca3af"
            autoFocus
            keyboardType={keyboardType}
            className="mt-3 rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900"
            onSubmitEditing={() => onSubmit(text)}
            returnKeyType="done"
          />
          <View className="mt-4 flex-row justify-end gap-6">
            <Pressable onPress={onCancel} hitSlop={8}>
              <Text className="text-base text-gray-600">Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onSubmit(text)} hitSlop={8}>
              <Text className="text-base font-semibold" style={{ color: destructive ? MM.expense : MM.income }}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
