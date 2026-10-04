import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { today } from '../../domain/dates';
import { periodContaining, shiftPeriod, type PeriodKind } from '../../domain/periods';
import { getBudgetSummary } from '../../db/budgets';
import { categoryTotals, noteTotals } from '../../db/stats';
import { useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { Amount, PeriodHeader, SubTabs, usePeriodPrefs } from '../../components/mm/Common';
import { PercentBadge, PieChart } from '../../components/mm/Charts';
import { ChoiceSheet } from '../../components/mm/Sheets';
import { MM } from '../../components/mm/theme';

type Tab = 'stats' | 'budget' | 'note';
const KIND_LABEL: Record<PeriodKind, string> = { week: 'Weekly', month: 'Monthly', year: 'Annually' };

export default function Stats() {
  const prefs = usePeriodPrefs();
  const { baseCurrency } = useSettings();
  const [tab, setTab] = useState<Tab>('stats');
  const [kind, setKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState(today());
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [kindSheet, setKindSheet] = useState(false);

  const period = periodContaining(tab === 'budget' ? 'month' : kind, anchor, prefs);
  const data = useLedgerQuery(
    (db) => ({
      expense: categoryTotals(db, 'expense', period.from, period.to),
      income: categoryTotals(db, 'income', period.from, period.to),
      notes: tab === 'note' ? noteTotals(db, type, period.from, period.to) : [],
      budget: tab === 'budget' ? getBudgetSummary(db, period.from, period.to, format(parseISO(period.to), 'yyyy-MM')) : null,
    }),
    [period.from, period.to, tab, type]
  );
  const rows = data[type];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const sumOf = (list: { amount: number }[]) => list.reduce((s, r) => s + r.amount, 0);

  return (
    <View className="flex-1" style={{ backgroundColor: MM.bg }}>
      <PeriodHeader
        period={period}
        onShift={(n) => setAnchor(shiftPeriod(period, n, prefs).from)}
        right={
          tab !== 'budget' ? (
            <Pressable onPress={() => setKindSheet(true)} className="mr-2 flex-row items-center rounded-full border border-gray-300 px-3 py-1">
              <Text className="text-sm text-gray-800">{KIND_LABEL[kind]}</Text>
              <Ionicons name="chevron-down" size={14} color="#374151" />
            </Pressable>
          ) : null
        }
      />
      <SubTabs
        tabs={[
          { value: 'stats', label: 'Stats' },
          { value: 'budget', label: 'Budget' },
          { value: 'note', label: 'Note' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab !== 'budget' ? (
        <View className="flex-row border-b border-gray-200 bg-white">
          {(['income', 'expense'] as const).map((t) => {
            const on = type === t;
            const color = t === 'income' ? MM.income : MM.expense;
            return (
              <Pressable key={t} onPress={() => setType(t)} className="flex-1 items-center py-2.5" style={{ borderBottomWidth: 2, borderColor: on ? color : 'transparent' }}>
                <Text className="text-sm" style={{ color: on ? color : MM.muted }}>
                  {`${t === 'income' ? 'Income' : 'Exp.'}  `}
                  <Text className="font-semibold">
                    <Amount value={sumOf(data[t])} currency={baseCurrency} tone={on ? t : 'neutral'} />
                  </Text>
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {tab === 'stats' ? (
          <>
            <View className="bg-white py-4">
              <PieChart values={rows.map((r) => ({ label: r.name, value: r.amount }))} />
            </View>
            {rows.map((r, i) => (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: '/stats/[id]', params: { id: String(r.id), from: period.from, to: period.to, type } })}
                className="flex-row items-center border-b border-gray-100 bg-white px-4 py-3 active:bg-gray-50"
              >
                <PercentBadge share={total ? r.amount / total : 0} index={i} />
                <Text className="flex-1 text-[15px] text-gray-900">{`${r.icon ?? ''} ${r.name}`}</Text>
                <Amount value={r.amount} currency={baseCurrency} tone="neutral" className="text-[15px]" />
              </Pressable>
            ))}
            {rows.length === 0 ? <Text className="py-10 text-center text-sm text-gray-500">No {type === 'income' ? 'income' : 'expenses'} in this period.</Text> : null}
          </>
        ) : null}

        {tab === 'note' ? (
          <>
            {data.notes.map((n) => (
              <View key={n.note} className="flex-row items-center border-b border-gray-100 bg-white px-4 py-3">
                <Text className="flex-1 text-[15px] text-gray-900" numberOfLines={1}>
                  {n.note}
                </Text>
                <Text className="mr-3 text-xs text-gray-400">{`×${n.count}`}</Text>
                <Amount value={n.amount} currency={baseCurrency} tone={type} className="text-[15px]" />
              </View>
            ))}
            {data.notes.length === 0 ? <Text className="py-10 text-center text-sm text-gray-500">Nothing in this period.</Text> : null}
          </>
        ) : null}

        {tab === 'budget' && data.budget ? (
          <>
            <Pressable onPress={() => router.push('/settings/budgets')} className="flex-row items-center justify-between bg-white px-4 py-3">
              <Text className="text-sm text-gray-600">Budget setting</Text>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </Pressable>
            <BudgetBar
              label="Total"
              budget={data.budget.totalBudget}
              spent={data.budget.totalSpent}
              currency={baseCurrency}
              bold
            />
            {data.budget.lines.map((l) => (
              <BudgetBar key={l.accountId} label={`${l.icon ?? ''} ${l.name}`} budget={l.budget} spent={l.spent} currency={baseCurrency} />
            ))}
            {data.budget.totalBudget === 0 ? (
              <Text className="px-6 py-6 text-center text-sm text-gray-500">No budgets yet. Tap Budget setting to add monthly budgets per category.</Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <ChoiceSheet
        visible={kindSheet}
        title="Period"
        value={kind}
        options={(['week', 'month', 'year'] as PeriodKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        onClose={() => setKindSheet(false)}
        onPick={(k) => {
          setKind(k);
          setKindSheet(false);
        }}
      />
    </View>
  );
}

function BudgetBar({ label, budget, spent, currency, bold }: { label: string; budget: number; spent: number; currency: string; bold?: boolean }) {
  const ratio = budget > 0 ? spent / budget : 0;
  const over = budget > 0 && spent > budget;
  return (
    <View className="border-b border-gray-100 bg-white px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text className={`text-[15px] text-gray-900 ${bold ? 'font-semibold' : ''}`}>{label}</Text>
        <Amount value={budget} currency={currency} tone="neutral" className="text-sm" />
      </View>
      {budget > 0 ? (
        <>
          <View className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
            <View className="h-2.5 rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: over ? MM.expense : MM.income }} />
          </View>
          <View className="mt-1 flex-row justify-between">
            <Text className="text-xs" style={{ color: over ? MM.expense : MM.muted }}>{`${Math.round(ratio * 100)}%`}</Text>
            <View className="flex-row gap-3">
              <Amount value={spent} currency={currency} tone="expense" className="text-xs" />
              <Amount value={budget - spent} currency={currency} tone={over ? 'expense' : 'neutral'} className="text-xs" />
            </View>
          </View>
        </>
      ) : (
        <View className="mt-1 flex-row justify-between">
          <Text className="text-xs text-gray-400">No budget</Text>
          <Amount value={spent} currency={currency} tone="expense" className="text-xs" />
        </View>
      )}
    </View>
  );
}
