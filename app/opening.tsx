import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ACCOUNT_TYPE_LABELS } from '../domain/accounting';
import { dayBefore, startOfYearISO, today } from '../domain/dates';
import { formatMoney, parseMoney, parseRate, toDecimalString } from '../domain/money';
import { buildOpeningBalance, PostingError } from '../domain/posting';
import type { EntryInput } from '../domain/types';
import { listAccounts, requireAccountByCode } from '../db/accounts';
import { SYSTEM_CODES } from '../db/seed';
import { createTransaction, getTransaction, updateTransaction } from '../db/transactions';
import { useDb, useMutation, useSettings } from '../hooks/useLedger';
import { Banner, Button, DateField, Input, SectionTitle } from '../components/ui';

/** Find the opening-balances transaction this screen manages, if any. */
function findOpening(db: ReturnType<typeof useDb>) {
  const row = db.getFirstSync<{ id: number }>(
    `SELECT id FROM transactions WHERE kind = 'opening' AND status = 'posted' ORDER BY id LIMIT 1`,
    []
  );
  return row ? getTransaction(db, row.id) : null;
}

export default function OpeningBalances() {
  const db = useDb();
  const mutate = useMutation();
  const { baseCurrency: base } = useSettings();

  const { accounts, existing } = useMemo(() => {
    const accounts = listAccounts(db, false).filter((a) => (a.type === 'asset' || a.type === 'liability') && !a.is_placeholder);
    return { accounts, existing: findOpening(db) };
  }, [db]);

  const [date, setDate] = useState(existing?.date ?? dayBefore(startOfYearISO(today())));
  const [amounts, setAmounts] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const e of existing?.entries ?? []) {
      const a = accounts.find((x) => x.id === e.account_id);
      if (!a) continue;
      const natural = (a.type === 'asset') === e.debit > 0 ? e.fx_amount : -e.fx_amount;
      m[a.id] = toDecimalString(natural, a.currency);
    }
    return m;
  });
  const [rates, setRates] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const e of existing?.entries ?? []) if (e.currency !== base) m[e.account_id] = e.fx_rate;
    return m;
  });

  const result = useMemo<{ entries: EntryInput[]; error: string | null; equity: number }>(() => {
    try {
      const obe = requireAccountByCode(db, SYSTEM_CODES.openingEquity);
      const lines: EntryInput[] = [];
      let equity = 0;
      for (const a of accounts) {
        const text = amounts[a.id]?.trim();
        if (!text) continue;
        const amount = parseMoney(text, a.currency);
        if (amount == null) throw new PostingError(`"${a.name}": not a valid ${a.currency} amount.`);
        if (amount === 0) continue;
        const rate = a.currency !== base ? parseRate(rates[a.id] ?? '') ?? undefined : undefined;
        const [acctLine, eqLine] = buildOpeningBalance({ baseCurrency: base, account: a, amount, rate, openingEquity: obe });
        lines.push(acctLine);
        equity += eqLine.credit - eqLine.debit;
      }
      if (equity !== 0) {
        lines.push({
          account_id: obe.id,
          debit: equity < 0 ? -equity : 0,
          credit: equity > 0 ? equity : 0,
          currency: base,
          fx_amount: Math.abs(equity),
          fx_rate: '1',
          memo: 'Net worth at start',
        });
      }
      return { entries: lines, error: lines.length < 2 ? 'Enter at least one balance.' : null, equity };
    } catch (e) {
      return { entries: [], error: e instanceof Error ? e.message : String(e), equity: 0 };
    }
  }, [db, accounts, amounts, rates, base]);

  const save = () => {
    const id = mutate((d) => {
      const input = { date, kind: 'opening' as const, description: 'Opening balances', entries: result.entries };
      if (existing) {
        updateTransaction(d, existing.id, { ...input, reference: existing.reference });
        return existing.id;
      }
      return createTransaction(d, input);
    });
    if (id) router.back();
  };

  const groups = (['asset', 'liability'] as const).map((t) => ({ type: t, list: accounts.filter((a) => a.type === t) }));

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        <Banner tone="info">
          Enter what each account held at the start date: money in banks and cash, and what you owe on cards and loans (as positive
          numbers). The difference is your opening net worth, posted to Opening Balance Equity.
        </Banner>
        <View className="mx-4 mt-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <Text className="text-base text-gray-900">Balances as at</Text>
          <DateField inline value={date} onChange={setDate} />
        </View>
        {groups.map((g) => (
          <View key={g.type}>
            <SectionTitle>{ACCOUNT_TYPE_LABELS[g.type]}</SectionTitle>
            <View className="mx-4 gap-3 rounded-xl border border-gray-200 bg-white p-4">
              {g.list.map((a) => (
                <View key={a.id} className="flex-row items-center gap-2">
                  <View className="flex-1">
                    <Text className="text-sm text-gray-900">{a.name}</Text>
                    <Text className="text-xs text-gray-500">{a.code}</Text>
                  </View>
                  <View className="w-36">
                    <Input
                      value={amounts[a.id] ?? ''}
                      onChangeText={(t) => setAmounts((m) => ({ ...m, [a.id]: t }))}
                      placeholder="0.00"
                      keyboardType="numbers-and-punctuation"
                      className="text-right"
                      right={<Text className="text-xs text-gray-500">{a.currency}</Text>}
                    />
                  </View>
                  {a.currency !== base ? (
                    <View className="w-20">
                      <Input
                        value={rates[a.id] ?? ''}
                        onChangeText={(t) => setRates((m) => ({ ...m, [a.id]: t }))}
                        placeholder="Rate"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}
        <View className="mx-4 mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <Text className="text-sm text-gray-600">Opening net worth</Text>
          <Text className="text-xl font-bold text-gray-900">{formatMoney(result.equity, base)}</Text>
          {result.error ? <Text className="mt-1 text-sm text-red-600">{result.error}</Text> : null}
        </View>
        <Text className="mx-4 mt-3 text-xs text-gray-500">
          Missing an account? Add it under Accounts first; it will appear here.
        </Text>
      </ScrollView>
      <View className="border-t border-gray-200 bg-white px-4 pb-8 pt-3">
        <Button disabled={!!result.error} onPress={save}>
          {existing ? 'Update opening balances' : 'Save opening balances'}
        </Button>
      </View>
    </View>
  );
}
