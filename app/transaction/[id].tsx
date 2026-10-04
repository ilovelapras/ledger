import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { KIND_LABELS } from '../../domain/accounting';
import { displayDate, today } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import { totals } from '../../domain/posting';
import { getAudit } from '../../db/audit';
import { getReversals, getTransaction, reverseTransaction, voidTransaction } from '../../db/transactions';
import { useLedgerQuery, useMutation, useSettings } from '../../hooks/useLedger';
import { Badge, Banner, Button, EmptyState, MoneyText, SectionTitle } from '../../components/ui';

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const txId = Number(id);
  const { baseCurrency: base, lockDate } = useSettings();
  const mutate = useMutation();
  const [showAudit, setShowAudit] = useState(false);

  const data = useLedgerQuery(
    (db) => ({
      tx: getTransaction(db, txId),
      reversals: getReversals(db, txId),
      audit: getAudit(db, 'transaction', txId),
    }),
    [txId]
  );
  const tx = data.tx;
  if (!tx) return <EmptyState title="Transaction not found" />;

  const t = totals(tx.entries);
  const reconciled = tx.entries.some((e) => e.cleared === 'reconciled');
  const locked = !!lockDate && tx.date <= lockDate;
  const isVoid = tx.status === 'void';
  const activeReversal = data.reversals.find((r) => r.status === 'posted');
  const canChange = !isVoid && !reconciled && !locked;

  const confirmVoid = () =>
    Alert.prompt(
      'Void transaction',
      'It stays in the audit trail but no longer affects any balance. Reason:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Void', style: 'destructive', onPress: (reason?: string) => mutate((db) => voidTransaction(db, txId, reason || 'Voided')) },
      ],
      'plain-text'
    );

  const confirmReverse = () =>
    Alert.alert(
      'Reverse transaction',
      `Posts an opposite entry dated today (${displayDate(today())}). Use this when the original period is closed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reverse',
          onPress: () => {
            const newId = mutate((db) => reverseTransaction(db, txId, today()));
            if (newId) router.push(`/transaction/${newId}`);
          },
        },
      ]
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: tx.reference,
          headerRight: canChange
            ? () => (
                <Pressable onPress={() => router.push(`/transaction/edit/${txId}`)} hitSlop={12}>
                  <Text className="text-base font-semibold text-primary-700">Edit</Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ paddingBottom: 40 }}>
        {isVoid ? <Banner tone="error">{`Void — ${tx.void_reason ?? ''}`}</Banner> : null}
        {reconciled ? <Banner tone="info">Part of a completed bank reconciliation. Undo the reconciliation to change it.</Banner> : null}
        {locked && !isVoid ? <Banner tone="warn">{`In a locked period (up to ${lockDate}). Reverse it instead of editing.`}</Banner> : null}
        {activeReversal ? (
          <Pressable onPress={() => router.push(`/transaction/${activeReversal.id}`)}>
            <Banner tone="warn">{`Reversed by ${activeReversal.reference} →`}</Banner>
          </Pressable>
        ) : null}
        {tx.reverses_id ? (
          <Pressable onPress={() => router.push(`/transaction/${tx.reverses_id}`)}>
            <Banner tone="info">Reversal of an earlier transaction →</Banner>
          </Pressable>
        ) : null}

        <View className="mx-4 mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <View className="flex-row items-center gap-2">
            <Badge tone={tx.kind === 'payment' ? 'amber' : tx.kind === 'receipt' ? 'green' : 'blue'}>{KIND_LABELS[tx.kind]}</Badge>
            <Text className="text-sm text-gray-500">{tx.reference}</Text>
          </View>
          <Text className="mt-2 text-xl font-semibold text-gray-900">{tx.payee_name || tx.description || KIND_LABELS[tx.kind]}</Text>
          {tx.payee_name && tx.description ? <Text className="mt-0.5 text-base text-gray-700">{tx.description}</Text> : null}
          <Text className="mt-1 text-sm text-gray-500">{displayDate(tx.date)}</Text>
          <MoneyText amount={t.debit} currency={base} code className="mt-3 text-2xl font-bold text-gray-900" />
          {tx.memo ? <Text className="mt-3 text-sm text-gray-700">{tx.memo}</Text> : null}
        </View>

        <SectionTitle>Journal lines</SectionTitle>
        <View className="mx-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <View className="flex-row border-b border-gray-200 bg-gray-50 px-3 py-2">
            <Text className="flex-1 text-xs font-semibold text-gray-500">Account</Text>
            <Text className="w-24 text-right text-xs font-semibold text-gray-500">Debit</Text>
            <Text className="w-24 text-right text-xs font-semibold text-gray-500">Credit</Text>
          </View>
          {tx.entries.map((e) => (
            <Pressable key={e.id} onPress={() => router.push(`/account/${e.account_id}`)} className="flex-row border-b border-gray-100 px-3 py-2.5 active:bg-gray-50">
              <View className="flex-1 pr-2">
                <Text className="text-sm text-gray-900">{`${e.account_code}  ${e.account_name}`}</Text>
                {e.currency !== base ? (
                  <Text className="text-xs text-gray-500">{`${formatMoney(e.fx_amount, e.currency)} @ ${e.fx_rate}`}</Text>
                ) : null}
                {e.memo ? <Text className="text-xs text-gray-500">{e.memo}</Text> : null}
                {e.cleared !== 'uncleared' ? <Text className="text-xs text-primary-700">{e.cleared === 'reconciled' ? 'Reconciled' : 'Cleared'}</Text> : null}
              </View>
              <Text className="w-24 text-right text-sm text-gray-900" style={{ fontVariant: ['tabular-nums'] }}>
                {e.debit ? formatMoney(e.debit, base, { code: false }) : ''}
              </Text>
              <Text className="w-24 text-right text-sm text-gray-900" style={{ fontVariant: ['tabular-nums'] }}>
                {e.credit ? formatMoney(e.credit, base, { code: false }) : ''}
              </Text>
            </Pressable>
          ))}
          <View className="flex-row px-3 py-2.5">
            <Text className="flex-1 text-sm font-semibold text-gray-900">Total</Text>
            <Text className="w-24 text-right text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(t.debit, base, { code: false })}
            </Text>
            <Text className="w-24 text-right text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(t.credit, base, { code: false })}
            </Text>
          </View>
        </View>

        <View className="mx-4 mt-5 gap-2">
          <Button variant="outline" onPress={() => router.push({ pathname: '/transaction/new', params: { duplicate: String(txId) } })}>
            Duplicate
          </Button>
          {!isVoid && !activeReversal && tx.kind !== 'reversal' ? (
            <Button variant="outline" onPress={confirmReverse}>
              Reverse
            </Button>
          ) : null}
          {canChange ? (
            <Button variant="danger" onPress={confirmVoid}>
              Void
            </Button>
          ) : null}
        </View>

        <SectionTitle right={<Text onPress={() => setShowAudit((s) => !s)} className="text-sm font-medium text-primary-700">{showAudit ? 'Hide' : 'Show'}</Text>}>
          {`History (${data.audit.length})`}
        </SectionTitle>
        {showAudit ? (
          <View className="mx-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {data.audit.map((a) => (
              <View key={a.id} className="border-b border-gray-100 px-3 py-2">
                <Text className="text-sm font-medium capitalize text-gray-900">{a.action}</Text>
                <Text className="text-xs text-gray-500">{new Date(a.ts).toLocaleString()}</Text>
                {a.action === 'update' ? <AuditDiff before={a.before_json} after={a.after_json} /> : null}
              </View>
            ))}
          </View>
        ) : null}
        <Text className="mx-4 mt-3 text-xs text-gray-400">{`Created ${new Date(tx.created_at).toLocaleString()} · updated ${new Date(tx.updated_at).toLocaleString()}`}</Text>
      </ScrollView>
    </>
  );
}

/** Summarise which header fields and totals changed in an edit. */
function AuditDiff({ before, after }: { before: string | null; after: string | null }) {
  if (!before || !after) return null;
  const b = JSON.parse(before);
  const a = JSON.parse(after);
  const changes: string[] = [];
  for (const k of ['date', 'reference', 'description', 'memo', 'payee_name']) {
    if ((b[k] ?? '') !== (a[k] ?? '')) changes.push(`${k.replace('_name', '')}: “${b[k] ?? ''}” → “${a[k] ?? ''}”`);
  }
  const lines = (x: { entries: { account_name: string; debit: number; credit: number }[] }) =>
    x.entries.map((e) => `${e.account_name} ${e.debit ? 'Dr' : 'Cr'} ${e.debit || e.credit}`).join('; ');
  if (lines(b) !== lines(a)) changes.push('lines changed');
  return <Text className="mt-0.5 text-xs text-gray-600">{changes.join(' · ') || 'No visible change'}</Text>;
}
