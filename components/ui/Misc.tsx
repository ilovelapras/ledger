import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatMoney } from '../../domain/money';

/** Amount in accounting format with tabular digits. */
export function MoneyText({
  amount,
  currency,
  className,
  code = false,
  colored = false,
}: {
  amount: number;
  currency: string;
  className?: string;
  code?: boolean;
  colored?: boolean;
}) {
  const color = colored ? (amount < 0 ? 'text-red-600' : 'text-gray-900') : '';
  return (
    <Text className={`${color} ${className ?? ''}`} style={{ fontVariant: ['tabular-nums'] }}>
      {formatMoney(amount, currency, { code })}
    </Text>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  className?: string;
}) {
  return (
    <View className={`flex-row rounded-lg bg-gray-200 p-0.5 ${className ?? ''}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`flex-1 items-center rounded-md py-1.5 ${active ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`text-sm ${active ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontally scrolling filter chips. */
export function Chips<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            className={`rounded-full border px-3 py-1.5 ${
              active ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-white'
            }`}
          >
            <Text className={`text-sm ${active ? 'font-semibold text-white' : 'text-gray-700'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'green' | 'red' | 'blue' | 'amber' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    amber: 'bg-amber-100 text-amber-800',
  };
  const [bg, fg] = tones[tone].split(' ');
  return (
    <View className={`self-start rounded px-1.5 py-0.5 ${bg}`}>
      <Text className={`text-[11px] font-semibold uppercase ${fg}`}>{children}</Text>
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: React.ReactNode }) {
  return (
    <View className="items-center px-8 py-12">
      <Text className="text-center text-base font-semibold text-gray-900">{title}</Text>
      {message ? <Text className="mt-1 text-center text-sm text-gray-500">{message}</Text> : null}
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between px-4 pb-2 pt-5">
      <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</Text>
      {right}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  indent = 0,
  muted,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  indent?: number;
  muted?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center border-b border-gray-100 bg-white py-3 pr-4 active:bg-gray-50"
      style={{ paddingLeft: 16 + indent * 16 }}
    >
      <View className="mr-3 flex-1">
        {typeof title === 'string' ? (
          <Text numberOfLines={1} className={`text-base ${muted ? 'text-gray-400' : 'text-gray-900'}`}>
            {title}
          </Text>
        ) : (
          title
        )}
        {typeof subtitle === 'string' ? (
          <Text numberOfLines={1} className="mt-0.5 text-xs text-gray-500">
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
      </View>
      {right}
    </Pressable>
  );
}

export function Banner({ tone, children }: { tone: 'info' | 'warn' | 'error'; children: React.ReactNode }) {
  const cls = {
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-900',
  }[tone].split(' ');
  return (
    <View className={`mx-4 mt-3 rounded-lg border p-3 ${cls[0]} ${cls[1]}`}>
      {typeof children === 'string' ? <Text className={`text-sm ${cls[2]}`}>{children}</Text> : children}
    </View>
  );
}
