import React, { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { isMoneyAccount, SUBTYPE_LABELS, ACCOUNT_TYPE_LABELS } from '../../domain/accounting';
import { displayDate } from '../../domain/dates';
import { toDecimalString } from '../../domain/money';
import { toCsv } from '../../db/backup';
import { getAccountLedger } from '../../db/reports';
import { lastReconciliation } from '../../db/reconcile';
import { useLedgerQuery, useSettings } from '../../hooks/useLedger';
import { DateRangeBar, rangeFromPreset, type DateRange } from '../../components/DateRangeBar';
import { Badge, Button, EmptyState, MoneyText } from '../../components/ui';
import { shareTextFile } from '../../utils/share';

export default function AccountLedgerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const { baseCurrency: base } = useSettings();
  const [range, setRange] = useState<DateRange>(rangeFromPreset('this_year'));

  const data = useLedgerQuery(
    (db) => ({ ledger: getAccountLedger(db, accountId, range.from, range.to), lastRec: lastReconciliation(db, accountId) }),
    [accountId, range.from, range.to]
  );
  const l = data.ledger;
  if (!l) return <EmptyState title="Account not found" />;
  const a = l.account;
  const foreign = a.currency !== base;
  const cur = a.currency;
  const showNative = foreign;

  const exportCsv = () =>
    shareTextFile(
      `ledger-${a.code}-${range.from}-to-${range.to}.csv`,
      toCsv([
        [`General ledger: ${a.code} ${a.name}`, `${range.from} to ${range.to}`],
        ['Date', 'Reference', 'Payee', 'Description', 'Memo', `Debit (${base})`, `Credit (${base})`, `Balance (${base})`, ...(foreign ? [`Amount (${cur})`, `Balance (${cur})`] : []), 'Cleared'],
        ['', '', '', 'Opening balance', '', '', '', toDecimalString(l.openingBase, base), ...(foreign ? ['', toDecimalString(l.openingNative, cur)] : []), ''],
        ...l.lines.map((x) => [
          x.date, x.reference, x.payee_name, x.description, x.memo,
          x.debit ? toDecimalString(x.debit, base) : '', x.credit ? toDecimalString(x.credit, base) : '',
          toDecimalString(x.balance, base),
          ...(foreign ? [toDecimalString(x.nativeAmount, cur), toDecimalString(x.nativeBalance, cur)] : []),
          x.cleared,
        ]),
        ['', '', '', 'Closing balance', '', toDecimalString(l.totalDebit, base), toDecimalString(l.totalCredit, base), toDecimalString(l.closingBase, base), ...(foreign ? ['', toDecimalString(l.closingNative, cur)] : []), ''],
      ]),
      'csv'
    );

  return (
    <View className="flex-1 bg-gray-50">
      <Stack.Screen
        options={{
          title: a.name,
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/account/edit', params: { id: String(a.id) } })} hitSlop={12}>
              <Text className="text-base font-semibold text-primary-700">Edit</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={l.lines}
        keyExtractor={(x) => String(x.entry_id)}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <>
            <View className="border-b border-gray-200 bg-white px-4 py-4">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-sm text-gray-500">{a.code}</Text>
                <Badge>{ACCOUNT_TYPE_LABELS[a.type]}</Badge>
                {a.subtype !== 'general' ? <Badge tone="blue">{SUBTYPE_LABELS[a.subtype]}</Badge> : null}
                {!a.is_active ? <Badge tone="red">Inactive</Badge> : null}
              </View>
              {a.institution || a.account_no ? (
                <Text className="mt-1 text-sm text-gray-600">{[a.institution, a.account_no ? `••${a.account_no}` : null].filter(Boolean).join(' · ')}</Text>
              ) : null}
              <Text className="mt-3 text-xs text-gray-500">{`Balance at ${displayDate(range.to > '2900' ? new Date().toISOString().slice(0, 10) : range.to)}`}</Text>
              <MoneyText amount={showNative ? l.closingNative : l.closingBase} currency={showNative ? cur : base} code colored className="text-2xl font-bold" />
              {foreign ? <MoneyText amount={l.closingBase} currency={base} code className="text-sm text-gray-500" /> : null}
              {data.lastRec ? (
                <Text className="mt-1 text-xs text-gray-500">{`Last reconciled to ${displayDate(data.lastRec.statement_date)}`}</Text>
              ) : null}
              <View className="mt-3 flex-row flex-wrap gap-2">
                {isMoneyAccount(a) ? (
                  <>
                    <Button size="sm" variant="outline" onPress={() => router.push({ pathname: '/transaction/new', params: { mode: 'payment', accountId: String(a.id) } })}>
                      Payment
                    </Button>
                    <Button size="sm" variant="outline" onPress={() => router.push({ pathname: '/transaction/new', params: { mode: 'receipt', accountId: String(a.id) } })}>
                      Receipt
                    </Button>
                    <Button size="sm" variant="outline" onPress={() => router.push({ pathname: '/transaction/new', params: { mode: 'transfer', accountId: String(a.id) } })}>
                      Transfer
                    </Button>
                    <Button size="sm" variant="outline" onPress={() => router.push(`/account/reconcile/${a.id}`)}>
                      Reconcile
                    </Button>
                  </>
                ) : null}
                <Button size="sm" variant="ghost" onPress={exportCsv}>
                  Export CSV
                </Button>
              </View>
            </View>
            <DateRangeBar value={range} onChange={setRange} />
            <LedgerRow
              label="Opening balance"
              sub={displayDate(range.from < '1901' ? '1900-01-01' : range.from)}
              amount={undefined}
              balance={showNative ? l.openingNative : l.openingBase}
              currency={showNative ? cur : base}
            />
          </>
        }
        renderItem={({ item: x }) => (
          <LedgerRow
            label={x.payee_name || x.description || x.reference}
            sub={`${displayDate(x.date)} · ${x.reference}${x.memo ? ` · ${x.memo}` : ''}`}
            amount={showNative ? x.nativeAmount : x.debit - x.credit}
            debitCredit={!showNative}
            balance={showNative ? x.nativeBalance : x.balance}
            currency={showNative ? cur : base}
            cleared={x.cleared}
            onPress={() => router.push(`/transaction/${x.transaction_id}`)}
          />
        )}
        ListEmptyComponent={<EmptyState title="No activity in this period" />}
        ListFooterComponent={
          <View className="flex-row border-t border-gray-300 bg-white px-4 py-3">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900">Closing balance</Text>
              <Text className="text-xs text-gray-500">
                {`Dr ${toDecimalString(l.totalDebit, base)} · Cr ${toDecimalString(l.totalCredit, base)} ${base}`}
              </Text>
            </View>
            <MoneyText amount={showNative ? l.closingNative : l.closingBase} currency={showNative ? cur : base} colored className="text-base font-bold" />
          </View>
        }
      />
    </View>
  );
}

function LedgerRow({
  label,
  sub,
  amount,
  debitCredit,
  balance,
  currency,
  cleared,
  onPress,
}: {
  label: string;
  sub: string;
  amount: number | undefined;
  debitCredit?: boolean;
  balance: number;
  currency: string;
  cleared?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="flex-row items-center border-b border-gray-100 bg-white px-4 py-2.5 active:bg-gray-50">
      <Text className="w-4 text-xs text-primary-700">{cleared === 'reconciled' ? 'R' : cleared === 'cleared' ? 'c' : ''}</Text>
      <View className="mr-2 flex-1">
        <Text numberOfLines={1} className="text-sm text-gray-900">
          {label}
        </Text>
        <Text numberOfLines={1} className="text-xs text-gray-500">
          {sub}
        </Text>
      </View>
      <View className="w-24 items-end">
        {amount !== undefined ? (
          <>
            <MoneyText amount={Math.abs(amount)} currency={currency} className="text-sm text-gray-900" />
            {debitCredit ? <Text className="text-[10px] text-gray-500">{amount >= 0 ? 'Dr' : 'Cr'}</Text> : null}
          </>
        ) : null}
      </View>
      <View className="w-28 items-end">
        <MoneyText amount={balance} currency={currency} colored className="text-sm font-medium" />
      </View>
    </Pressable>
  );
}
