import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '../../domain/money';
import { periodLabel, rangeSubtitle, type Period, type PeriodPrefs } from '../../domain/periods';
import type { TxRow } from '../../db/stats';
import { useSettings } from '../../hooks/useLedger';
import { kindColor, MM } from './theme';

export function usePeriodPrefs(): PeriodPrefs {
  const s = useSettings();
  return { monthStartDay: s.monthStartDay, weekStart: s.weekStart };
}

/** ‹ Oct 2026 › */
export function PeriodHeader({
  period,
  onShift,
  right,
}: {
  period: Period;
  onShift: (n: number) => void;
  right?: React.ReactNode;
}) {
  const prefs = usePeriodPrefs();
  const showRange = period.kind === 'week' || prefs.monthStartDay !== 1;
  return (
    <View className="flex-row items-center justify-between bg-white px-2 py-2">
      <View className="flex-row items-center">
        <Pressable onPress={() => onShift(-1)} hitSlop={10} className="p-2" accessibilityLabel="Previous period">
          <Ionicons name="chevron-back" size={20} color="#111827" />
        </Pressable>
        <View className="items-center">
          <Text className="text-lg font-semibold text-gray-900">{periodLabel(period, prefs)}</Text>
          {showRange && period.kind !== 'week' ? <Text className="text-[11px] text-gray-500">{rangeSubtitle(period)}</Text> : null}
        </View>
        <Pressable onPress={() => onShift(1)} hitSlop={10} className="p-2" accessibilityLabel="Next period">
          <Ionicons name="chevron-forward" size={20} color="#111827" />
        </Pressable>
      </View>
      {right}
    </View>
  );
}

export function Amount({
  value,
  currency,
  tone,
  className,
}: {
  value: number;
  currency: string;
  tone?: 'income' | 'expense' | 'neutral' | 'auto';
  className?: string;
}) {
  const color =
    tone === 'income' ? MM.income : tone === 'expense' ? MM.expense : tone === 'auto' ? (value < 0 ? MM.expense : MM.income) : '#111827';
  return (
    <Text className={className} style={{ color, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
      {formatMoney(value, currency, { code: false, parens: false })}
    </Text>
  );
}

/** Income | Exp. | Total */
export function TotalsBar({ income, expense, currency }: { income: number; expense: number; currency: string }) {
  return (
    <View className="flex-row border-b border-gray-200 bg-white py-2">
      <Cell label="Income">
        <Amount value={income} currency={currency} tone="income" className="text-base font-semibold" />
      </Cell>
      <Cell label="Exp.">
        <Amount value={expense} currency={currency} tone="expense" className="text-base font-semibold" />
      </Cell>
      <Cell label="Total">
        <Amount value={income - expense} currency={currency} tone="neutral" className="text-base font-semibold" />
      </Cell>
    </View>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-xs text-gray-500">{label}</Text>
      {children}
    </View>
  );
}

export function categoryLabel(r: Pick<TxRow, 'kind' | 'category_name' | 'parent_category_name'>): string {
  if (r.kind === 'transfer') return 'Transfer';
  if (r.kind === 'reversal' || r.kind === 'journal') return 'Adjustment';
  return r.parent_category_name ?? r.category_name ?? '—';
}

/** One transaction in a list: category | note + account | amount. */
export function TxListItem({ row, baseCurrency, onPress }: { row: TxRow; baseCurrency: string; onPress: () => void }) {
  const isTransfer = row.kind === 'transfer';
  const sub = row.parent_category_name ? row.category_name : null;
  const foreign = row.account_currency !== baseCurrency;
  return (
    <Pressable onPress={onPress} className="flex-row items-center border-b border-gray-100 bg-white px-4 py-2.5 active:bg-gray-50">
      <View className="w-24 pr-2">
        <Text numberOfLines={1} className="text-sm text-gray-700">
          {row.category_icon && !isTransfer ? `${row.category_icon} ` : ''}
          {categoryLabel(row)}
        </Text>
        {sub ? (
          <Text numberOfLines={1} className="text-[11px] text-gray-400">
            {sub}
          </Text>
        ) : null}
      </View>
      <View className="flex-1 pr-2">
        <Text numberOfLines={1} className="text-[15px] text-gray-900">
          {row.description || (isTransfer ? `${row.account_name} → ${row.category_name}` : row.category_name ?? '')}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text numberOfLines={1} className="flex-shrink text-xs text-gray-500">
            {isTransfer ? `${row.account_name} → ${row.category_name ?? ''}` : row.account_name}
          </Text>
          {row.installment ? <Text className="text-xs text-gray-400">{` · ${row.installment}`}</Text> : null}
          {row.recurrence_id ? <Ionicons name="repeat" size={12} color={MM.muted} /> : null}
          {row.photo_count ? <Ionicons name="image-outline" size={12} color={MM.muted} /> : null}
        </View>
      </View>
      <View className="items-end">
        <Text style={{ color: kindColor(row.kind), fontVariant: ['tabular-nums'] }} className="text-[15px]">
          {formatMoney(foreign ? row.native_amount : row.amount, foreign ? row.account_currency : baseCurrency, {
            code: foreign,
            parens: false,
          })}
        </Text>
        {foreign ? (
          <Text className="text-[11px] text-gray-400" style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoney(row.amount, baseCurrency, { parens: false })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Round floating "+" button. */
export function Fab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Add transaction"
      className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full shadow-lg"
      style={{ backgroundColor: MM.accent, elevation: 6 }}
    >
      <Ionicons name="add" size={30} color="#fff" />
    </Pressable>
  );
}

export function SubTabs<V extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View className="flex-row border-b border-gray-200 bg-white">
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <Pressable key={t.value} onPress={() => onChange(t.value)} className="flex-1 items-center py-2.5" accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text className={`text-sm ${on ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{t.label}</Text>
            <View className="mt-1.5 h-0.5 w-10 rounded-full" style={{ backgroundColor: on ? MM.accent : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}
