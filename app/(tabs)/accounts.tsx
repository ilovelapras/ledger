import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, buildTree, flattenTree, SUBTYPE_LABELS } from '../../domain/accounting';
import { today } from '../../domain/dates';
import { balanceOf, nativeBalanceOf } from '../../domain/reports';
import type { Account, AccountType } from '../../domain/types';
import { listAccounts } from '../../db/accounts';
import { accountTotals } from '../../db/reports';
import { useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { Badge, Button, MoneyText } from '../../components/ui';

type Row =
  | { kind: 'type'; type: AccountType; total: number }
  | { kind: 'account'; account: Account; depth: number; base: number; native: number; hasChildren: boolean };

export default function Accounts() {
  const { baseCurrency } = useSettings();
  const [showInactive, setShowInactive] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const { accounts, totals } = useLedgerQuery(
    (db) => ({ accounts: listAccounts(db, true), totals: accountTotals(db, { to: today() }) }),
    []
  );

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const visible = accounts.filter(
      (a) => (showInactive || a.is_active) && (!q || a.name.toLowerCase().includes(q) || a.code.includes(q))
    );
    const out: Row[] = [];
    for (const type of ACCOUNT_TYPES) {
      const ofType = visible.filter((a) => a.type === type);
      if (ofType.length === 0) continue;
      const tree = buildTree(ofType, (a) => balanceOf(a, totals));
      out.push({ kind: 'type', type, total: tree.reduce((s, n) => s + n.total, 0) });
      const hidden = new Set<number>();
      for (const { node, depth } of flattenTree(tree)) {
        const a = node.account;
        if (a.parent_id != null && (hidden.has(a.parent_id) || collapsed.has(a.parent_id))) {
          hidden.add(a.id);
          continue;
        }
        out.push({
          kind: 'account',
          account: a,
          depth,
          base: node.children.length ? node.total : node.balance,
          native: nativeBalanceOf(a, totals),
          hasChildren: node.children.length > 0,
        });
      }
    }
    return out;
  }, [accounts, totals, showInactive, query, collapsed]);

  const toggle = (id: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <View className="flex-1 bg-gray-50">
      <View className="gap-2 border-b border-gray-200 bg-white px-4 py-2">
        <View className="flex-row items-center gap-2">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search accounts"
            placeholderTextColor="#9ca3af"
            clearButtonMode="while-editing"
            className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-base text-gray-900"
          />
          <Button size="sm" onPress={() => router.push('/account/edit')}>
            + Account
          </Button>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-gray-600">Show inactive</Text>
          <Switch value={showInactive} onValueChange={setShowInactive} />
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === 'type' ? r.type : String(r.account.id))}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item: r }) =>
          r.kind === 'type' ? (
            <View className="flex-row items-center justify-between bg-gray-50 px-4 pb-1 pt-5">
              <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">{ACCOUNT_TYPE_LABELS[r.type]}</Text>
              <MoneyText amount={r.total} currency={baseCurrency} className="text-xs font-semibold text-gray-500" />
            </View>
          ) : (
            <Pressable
              onPress={() => (r.hasChildren ? toggle(r.account.id) : router.push(`/account/${r.account.id}`))}
              onLongPress={() => router.push({ pathname: '/account/edit', params: { id: String(r.account.id) } })}
              className="flex-row items-center border-b border-gray-100 bg-white py-3 pr-4 active:bg-gray-50"
              style={{ paddingLeft: 16 + r.depth * 18 }}
            >
              <Text className="w-5 text-gray-400">{r.hasChildren ? (collapsed.has(r.account.id) ? '▸' : '▾') : ''}</Text>
              <View className="mr-2 flex-1">
                <View className="flex-row items-center gap-2">
                  <Text
                    numberOfLines={1}
                    className={`flex-shrink text-base ${r.hasChildren || r.account.is_placeholder ? 'font-semibold' : ''} ${
                      r.account.is_active ? 'text-gray-900' : 'text-gray-400'
                    }`}
                  >
                    {r.account.name}
                  </Text>
                  {!r.account.is_active ? <Badge>Inactive</Badge> : null}
                  {r.account.currency !== baseCurrency ? <Badge tone="blue">{r.account.currency}</Badge> : null}
                </View>
                <Text className="text-xs text-gray-500">
                  {r.account.code}
                  {r.account.subtype !== 'general' ? ` · ${SUBTYPE_LABELS[r.account.subtype]}` : ''}
                  {r.account.institution ? ` · ${r.account.institution}` : ''}
                </Text>
              </View>
              <View className="items-end">
                {r.account.currency !== baseCurrency && !r.hasChildren ? (
                  <>
                    <MoneyText amount={r.native} currency={r.account.currency} code colored className="text-base" />
                    <MoneyText amount={r.base} currency={baseCurrency} code className="text-xs text-gray-500" />
                  </>
                ) : (
                  <MoneyText amount={r.base} currency={baseCurrency} colored className={`text-base ${r.hasChildren ? 'font-semibold' : ''}`} />
                )}
              </View>
            </Pressable>
          )
        }
        ListFooterComponent={
          <Text className="px-4 pt-4 text-center text-xs text-gray-400">Tap a header to collapse · long-press any account to edit</Text>
        }
      />
    </View>
  );
}
