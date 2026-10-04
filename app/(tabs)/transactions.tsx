import React, { useMemo, useState } from 'react';
import { SectionList, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { KIND_LABELS } from '../../domain/accounting';
import { displayDate } from '../../domain/dates';
import type { TxKind } from '../../domain/types';
import { listTransactions, type TransactionSummary } from '../../db/transactions';
import { useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { AccountPicker } from '../../components/AccountPicker';
import { DateRangeBar, rangeFromPreset, type DateRange } from '../../components/DateRangeBar';
import { Badge, Button, Chips, EmptyState, ListRow, MoneyText } from '../../components/ui';

const PAGE = 100;
type KindFilter = TxKind | 'all';
type StatusFilter = 'posted' | 'void' | 'all';

export default function Transactions() {
  const { baseCurrency } = useSettings();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('posted');
  const [range, setRange] = useState<DateRange>(rangeFromPreset('all'));
  const [accountId, setAccountId] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);

  const rows = useLedgerQuery(
    (db) =>
      listTransactions(db, {
        search,
        kind: kind === 'all' ? null : kind,
        status,
        from: range.from,
        to: range.to,
        accountId,
        limit,
      }),
    [search, kind, status, range.from, range.to, accountId, limit]
  );

  const sections = useMemo(() => {
    const byDate = new Map<string, TransactionSummary[]>();
    for (const r of rows) {
      const list = byDate.get(r.date) ?? [];
      list.push(r);
      byDate.set(r.date, list);
    }
    return [...byDate.entries()].map(([date, data]) => ({ title: date, data }));
  }, [rows]);

  const filtersActive = kind !== 'all' || status !== 'posted' || range.preset !== 'all' || accountId != null;

  return (
    <View className="flex-1 bg-gray-50">
      <View className="border-b border-gray-200 bg-white px-4 pb-2 pt-2">
        <View className="flex-row items-center gap-2">
          <TextInput
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              setLimit(PAGE);
            }}
            placeholder="Search payee, description, ref, account or amount"
            placeholderTextColor="#9ca3af"
            clearButtonMode="while-editing"
            autoCorrect={false}
            className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-base text-gray-900"
          />
          <Button size="sm" variant={filtersActive ? 'primary' : 'outline'} onPress={() => setShowFilters((s) => !s)}>
            Filter
          </Button>
        </View>
      </View>
      {showFilters ? (
        <View className="gap-2 border-b border-gray-200 bg-white pb-3">
          <DateRangeBar value={range} onChange={setRange} />
          <Chips<KindFilter>
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'All types' },
              ...(['payment', 'receipt', 'transfer', 'journal', 'opening', 'reversal'] as TxKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] })),
            ]}
          />
          <Chips<StatusFilter>
            value={status}
            onChange={setStatus}
            options={[
              { value: 'posted', label: 'Posted' },
              { value: 'void', label: 'Void' },
              { value: 'all', label: 'Posted + void' },
            ]}
          />
          <View className="flex-row items-center gap-2 px-4">
            <View className="flex-1">
              <AccountPicker value={accountId} onChange={setAccountId} placeholder="Any account" />
            </View>
            {accountId != null ? (
              <Button size="sm" variant="ghost" onPress={() => setAccountId(null)}>
                Clear
              </Button>
            ) : null}
          </View>
        </View>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View className="bg-gray-50 px-4 pb-1 pt-3">
            <Text className="text-xs font-semibold uppercase text-gray-500">{displayDate(section.title)}</Text>
          </View>
        )}
        renderItem={({ item: t }) => (
          <ListRow
            title={
              <View className="flex-row items-center gap-2">
                <Text numberOfLines={1} className={`flex-shrink text-base ${t.status === 'void' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {t.payee_name || t.description || KIND_LABELS[t.kind]}
                </Text>
                {t.status === 'void' ? <Badge tone="red">Void</Badge> : null}
              </View>
            }
            subtitle={`${t.reference} · ${t.accounts ?? ''}`}
            onPress={() => router.push(`/transaction/${t.id}`)}
            right={
              <View className="items-end">
                <MoneyText amount={t.amount ?? 0} currency={baseCurrency} className="text-base text-gray-900" />
                <Text className="text-[11px] text-gray-500">{KIND_LABELS[t.kind]}</Text>
              </View>
            }
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title={search || filtersActive ? 'No matching transactions' : 'No transactions yet'}
            message={search || filtersActive ? 'Try a different search or filter.' : 'Tap + to record your first entry.'}
          />
        }
        ListFooterComponent={
          rows.length >= limit ? (
            <View className="p-4">
              <Button variant="outline" onPress={() => setLimit((l) => l + PAGE)}>
                Load more
              </Button>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  );
}
