import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { evaluate, hasOperator, isOp, pressKey, toAmountText } from '../../domain/calc';
import { currencyDecimals } from '../../domain/money';
import { MM } from './theme';

const KEYS = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['.', '0', '⌫', '+'],
];

export function Keypad({
  value,
  currency,
  onChange,
  onDone,
}: {
  value: string;
  currency: string;
  onChange: (v: string) => void;
  onDone: () => void;
}) {
  const pending = hasOperator(value);
  const preview = pending ? evaluate(value) : null;
  return (
    <View className="border-t border-gray-200 bg-gray-50">
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text className="text-xs text-gray-500">{currency}</Text>
        {preview != null ? <Text className="text-xs text-gray-500">= {toAmountText(preview, currencyDecimals(currency))}</Text> : null}
        <View className="flex-row gap-4">
          <Pressable onPress={() => onChange('')} hitSlop={8}>
            <Text className="text-sm font-medium text-gray-600">Clear</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (pending) onChange(pressKey(value, '=', currency));
              else onDone();
            }}
            hitSlop={8}
          >
            <Text className="text-sm font-semibold" style={{ color: MM.accent }}>
              {pending ? '=' : 'Done'}
            </Text>
          </Pressable>
        </View>
      </View>
      {KEYS.map((row) => (
        <View key={row.join('')} className="flex-row">
          {row.map((k) => (
            <Pressable
              key={k}
              onPress={() => onChange(pressKey(value, k, currency))}
              className={`h-12 flex-1 items-center justify-center border-r border-t border-gray-200 active:bg-gray-200 ${
                isOp(k) ? 'bg-gray-100' : 'bg-white'
              }`}
              accessibilityLabel={k === '⌫' ? 'Delete' : k}
            >
              {k === '⌫' ? <Ionicons name="backspace-outline" size={22} color="#111827" /> : <Text className="text-xl text-gray-900">{k}</Text>}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}
