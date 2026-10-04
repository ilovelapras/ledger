import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { addMonths, format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney, parseMoney, toDecimalString } from '../../domain/money';
import { budgetFor, clearMonthOverride, listBudgets, setBudget } from '../../db/budgets';
import { listCategories } from '../../db/categories';
import { useLedgerQuery, useMutation, useSettings } from '../../hooks/useLedger';
import { PromptModal } from '../../components/mm/PromptModal';
import { MM } from '../../components/mm/theme';

/** Monthly budget per main expense category: an every-month default, optionally overridden for one month. */
export default function BudgetSettings() {
  const { baseCurrency } = useSettings();
  const mutate = useMutation();
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [scope, setScope] = useState<'default' | 'month'>('default');
  const [editing, setEditing] = useState<{ id: number; name: string; value: string } | null>(null);

  const data = useLedgerQuery(
    (db) => {
      const cats = listCategories(db, 'expense').map((g) => g.category);
      const rows = listBudgets(db);
      return cats.map((c) => ({
        cat: c,
        def: rows.find((r) => r.account_id === c.id && r.month === '')?.amount ?? 0,
        override: rows.find((r) => r.account_id === c.id && r.month === month)?.amount,
        effective: budgetFor(db, c.id, month),
      }));
    },
    [month]
  );
  const total = data.reduce((s, r) => s + (scope === 'default' ? r.def : r.effective), 0);

  const save = (text: string) => {
    if (!editing) return;
    const amount = text.trim() === '' ? 0 : parseMoney(text, baseCurrency);
    if (amount == null || amount < 0) return;
    mutate((db) => setBudget(db, editing.id, scope === 'default' ? '' : month, amount));
    setEditing(null);
  };

  return (
    <View className="flex-1" style={{ backgroundColor: MM.bg }}>
      <View className="flex-row bg-white p-2">
        {(['default', 'month'] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setScope(s)}
            className="flex-1 items-center rounded-md py-2"
            style={{ backgroundColor: scope === s ? '#fee2e2' : 'transparent' }}
          >
            <Text className="text-sm font-medium" style={{ color: scope === s ? MM.accent : MM.muted }}>
              {s === 'default' ? 'Every month' : 'One month only'}
            </Text>
          </Pressable>
        ))}
      </View>
      {scope === 'month' ? (
        <View className="flex-row items-center justify-center gap-6 border-t border-gray-100 bg-white py-2">
          <Pressable onPress={() => setMonth(format(addMonths(parseISO(`${month}-01`), -1), 'yyyy-MM'))} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color="#111827" />
          </Pressable>
          <Text className="text-base font-semibold text-gray-900">{format(parseISO(`${month}-01`), 'MMM yyyy')}</Text>
          <Pressable onPress={() => setMonth(format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM'))} hitSlop={10}>
            <Ionicons name="chevron-forward" size={20} color="#111827" />
          </Pressable>
        </View>
      ) : null}
      <View className="flex-row justify-between border-b border-gray-200 bg-white px-4 py-3">
        <Text className="text-[15px] font-semibold text-gray-900">Total</Text>
        <Text className="text-[15px] font-semibold text-gray-900">{formatMoney(total, baseCurrency)}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {data.map(({ cat, def, override, effective }) => {
          const shown = scope === 'default' ? def : effective;
          return (
            <Pressable
              key={cat.id}
              onPress={() => setEditing({ id: cat.id, name: cat.name, value: shown ? toDecimalString(shown, baseCurrency) : '' })}
              onLongPress={() => scope === 'month' && override != null && mutate((db) => clearMonthOverride(db, cat.id, month))}
              className="flex-row items-center border-b border-gray-100 bg-white px-4 py-3.5 active:bg-gray-50"
            >
              <Text className="flex-1 text-[15px] text-gray-900">{`${cat.icon ?? ''} ${cat.name}`}</Text>
              {scope === 'month' && override != null ? <Text className="mr-2 text-[11px] text-gray-400">this month</Text> : null}
              <Text className="text-[15px]" style={{ color: shown ? '#111827' : '#9ca3af' }}>
                {shown ? formatMoney(shown, baseCurrency, { code: false }) : 'Set'}
              </Text>
            </Pressable>
          );
        })}
        {scope === 'month' ? (
          <Text className="px-4 pt-3 text-xs text-gray-500">Hold a category to remove its one-month override and use the every-month budget again.</Text>
        ) : null}
      </ScrollView>
      <PromptModal
        visible={!!editing}
        title={editing ? `Budget: ${editing.name}` : ''}
        message={scope === 'default' ? 'Applies to every month. Leave blank to remove.' : `Only for ${format(parseISO(`${month}-01`), 'MMM yyyy')}.`}
        initial={editing?.value ?? ''}
        placeholder={`0.00 ${baseCurrency}`}
        confirmLabel="Save"
        keyboardType="decimal-pad"
        onCancel={() => setEditing(null)}
        onSubmit={save}
      />
    </View>
  );
}
