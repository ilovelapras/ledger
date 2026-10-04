import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { CURRENCIES, parseMoney, parseRate, toDecimalString } from '../../domain/money';
import { getAccount } from '../../db/accounts';
import {
  createMoneyAccount,
  getInitialBalance,
  listMoneyAccounts,
  removeMoneyAccount,
  setInitialBalance,
  updateMoneyAccount,
} from '../../db/moneyAccounts';
import { ACCOUNT_GROUPS, groupInfo, type AccountGroup } from '../../db/seed';
import { useDb, useMutation, useSettings } from '../../hooks/useLedger';
import { ChoiceSheet } from '../../components/mm/Sheets';
import { MM } from '../../components/mm/theme';

const day = z
  .string()
  .regex(/^(|[1-9]|[12]\d|3[01])$/, 'Enter a day from 1 to 31');

const schema = z.object({
  grp: z.string(),
  name: z.string().trim().min(1, 'Enter a name').max(60),
  icon: z.string().max(8),
  currency: z.string().length(3),
  initial: z.string().refine((s) => s.trim() === '' || /^-?[\d,]*\.?\d*$/.test(s.trim()), 'Enter a number'),
  rate: z.string(),
  includeInTotals: z.boolean(),
  statementDay: day,
  paymentDay: day,
  paymentAccountId: z.number().nullable(),
  notes: z.string().max(500),
});
type Values = z.infer<typeof schema>;

export default function EditAccount() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useDb();
  const mutate = useMutation();
  const { baseCurrency } = useSettings();
  const existing = useMemo(() => (id ? getAccount(db, Number(id)) : null), [db, id]);
  const used = useMemo(
    () => !!existing && db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM entries e JOIN transactions t ON t.id = e.transaction_id WHERE e.account_id = ? AND t.kind <> 'opening'`, [existing.id])!.n > 0,
    [db, existing]
  );
  const init = useMemo(() => (existing ? getInitialBalance(db, existing.id) : { amount: 0, rate: null }), [db, existing]);
  const payFrom = useMemo(() => listMoneyAccounts(db).filter((a) => a.type === 'asset'), [db]);
  const [sheet, setSheet] = useState<'group' | 'currency' | 'payfrom' | null>(null);

  const { control, handleSubmit, setValue } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      grp: existing?.grp ?? 'accounts',
      name: existing?.name ?? '',
      icon: existing?.icon ?? '',
      currency: existing?.currency ?? baseCurrency,
      initial: init.amount ? toDecimalString(init.amount, existing?.currency ?? baseCurrency) : '',
      rate: init.rate && init.rate !== '1' ? init.rate : '',
      includeInTotals: existing ? !!existing.include_in_totals : true,
      statementDay: existing?.statement_day ? String(existing.statement_day) : '',
      paymentDay: existing?.payment_day ? String(existing.payment_day) : '',
      paymentAccountId: existing?.payment_account_id ?? null,
      notes: existing?.notes ?? '',
    },
  });
  const v = useWatch({ control }) as Values;
  const group = groupInfo(v.grp);
  const isCard = v.grp === 'card';
  const foreign = v.currency !== baseCurrency;

  const submit = handleSubmit((vals) => {
    const amount = vals.initial.trim() ? parseMoney(vals.initial, vals.currency) : 0;
    if (amount == null) return Alert.alert('Initial balance', `Not a valid ${vals.currency} amount.`);
    const rate = foreign ? parseRate(vals.rate) ?? undefined : undefined;
    if (foreign && amount !== 0 && !rate) return Alert.alert('Exchange rate', `Enter how many ${baseCurrency} one ${vals.currency} is worth.`);
    const input = {
      name: vals.name,
      grp: vals.grp as AccountGroup,
      currency: vals.currency,
      icon: vals.icon.trim() || null,
      notes: vals.notes,
      includeInTotals: vals.includeInTotals,
      statementDay: vals.statementDay ? Number(vals.statementDay) : null,
      paymentDay: vals.paymentDay ? Number(vals.paymentDay) : null,
      paymentAccountId: vals.paymentAccountId,
    };
    const ok = mutate((d) => {
      const accId = existing ? (updateMoneyAccount(d, existing.id, input), existing.id) : createMoneyAccount(d, input);
      setInitialBalance(d, accId, amount, rate);
      return true;
    });
    if (ok) router.back();
  });

  const remove = () =>
    Alert.alert(
      used ? 'Hide account?' : 'Delete account?',
      used ? 'It has transactions, so it will be hidden but kept in your history and totals for past periods.' : 'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: used ? 'Hide' : 'Delete',
          style: 'destructive',
          onPress: () => {
            if (mutate((d) => removeMoneyAccount(d, existing!.id))) router.dismissTo('/accounts');
          },
        },
      ]
    );

  return (
    <View className="flex-1 bg-white">
      <Stack.Screen options={{ title: existing ? 'Edit account' : 'Add account' }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        <Pick label="Group" value={`${group.icon} ${group.label}`} onPress={() => setSheet('group')} />
        <Field label="Name">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                placeholder={fieldState.error?.message ?? 'e.g. DBS Multiplier'}
                placeholderTextColor={fieldState.error ? MM.expense : '#9ca3af'}
                className="flex-1 text-right text-base text-gray-900"
              />
            )}
          />
        </Field>
        <Field label="Icon">
          <Controller
            control={control}
            name="icon"
            render={({ field }) => (
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                placeholder={group.icon}
                className="flex-1 text-right text-xl"
                maxLength={8}
              />
            )}
          />
        </Field>
        <Pick
          label="Currency"
          value={v.currency}
          onPress={() => (used ? Alert.alert('Currency', "Currency can't change once the account has transactions.") : setSheet('currency'))}
        />
        <Field label={group.type === 'liability' ? 'Amount owed' : 'Initial balance'}>
          <Controller
            control={control}
            name="initial"
            render={({ field, fieldState }) => (
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                placeholder={fieldState.error?.message ?? '0.00'}
                placeholderTextColor={fieldState.error ? MM.expense : '#9ca3af'}
                keyboardType="numbers-and-punctuation"
                className="flex-1 text-right text-base text-gray-900"
              />
            )}
          />
          <Text className="ml-2 text-sm text-gray-500">{v.currency}</Text>
        </Field>
        {foreign ? (
          <Field label="Rate">
            <Text className="mr-2 text-xs text-gray-500">{`1 ${v.currency} = ? ${baseCurrency}`}</Text>
            <Controller
              control={control}
              name="rate"
              render={({ field }) => (
                <TextInput value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" placeholder="1.35" className="w-24 text-right text-base text-gray-900" />
              )}
            />
          </Field>
        ) : null}

        {isCard ? (
          <>
            <Text className="px-4 pb-1 pt-4 text-xs font-semibold uppercase text-gray-500">Card</Text>
            <DayField control={control} name="statementDay" label="Statement day" />
            <DayField control={control} name="paymentDay" label="Payment due day" />
            <Pick
              label="Paid from"
              value={payFrom.find((a) => a.id === v.paymentAccountId)?.name ?? 'Choose'}
              onPress={() => setSheet('payfrom')}
            />
          </>
        ) : null}

        <Field label="Include in totals">
          <Controller control={control} name="includeInTotals" render={({ field }) => <Switch value={field.value} onValueChange={field.onChange} />} />
        </Field>
        <View className="border-b border-gray-100 px-4 py-3">
          <Controller
            control={control}
            name="notes"
            render={({ field }) => (
              <TextInput value={field.value} onChangeText={field.onChange} placeholder="Description" placeholderTextColor="#9ca3af" multiline className="min-h-[48px] text-base text-gray-900" />
            )}
          />
        </View>
        <Text className="px-4 pt-3 text-xs text-gray-500">
          {group.type === 'liability'
            ? 'Cards, overdrafts and loans hold money you owe. Enter what you owed before your first transaction here.'
            : 'Enter what the account held before your first transaction here. It counts towards your balance, not your income.'}
        </Text>

        {existing ? (
          <Pressable onPress={remove} className="mx-4 mt-6 items-center rounded-lg border py-3" style={{ borderColor: MM.expense }}>
            <Text className="text-base font-medium" style={{ color: MM.expense }}>
              {used ? 'Hide account' : 'Delete account'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <View className="border-t border-gray-200 px-4 pb-8 pt-3">
        <Pressable onPress={submit} className="h-12 items-center justify-center rounded-lg" style={{ backgroundColor: MM.accent }}>
          <Text className="text-base font-semibold text-white">Save</Text>
        </Pressable>
      </View>

      <ChoiceSheet
        visible={sheet === 'group'}
        title="Group"
        value={v.grp}
        options={ACCOUNT_GROUPS.map((g) => ({
          value: g.key,
          label: `${g.icon}  ${g.label}`,
          sub: g.type === 'liability' ? 'Money you owe' : undefined,
        }))}
        onClose={() => setSheet(null)}
        onPick={(g) => {
          if (used && groupInfo(g).type !== groupInfo(v.grp).type) {
            Alert.alert('Group', "This account has transactions, so it can't switch between money you have and money you owe.");
          } else setValue('grp', g);
          setSheet(null);
        }}
      />
      <ChoiceSheet
        visible={sheet === 'currency'}
        title="Currency"
        value={v.currency}
        options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
        onClose={() => setSheet(null)}
        onPick={(c) => {
          setValue('currency', c);
          setSheet(null);
        }}
      />
      <ChoiceSheet
        visible={sheet === 'payfrom'}
        title="Card paid from"
        value={v.paymentAccountId ?? -1}
        options={[{ value: -1, label: 'Not set' }, ...payFrom.map((a) => ({ value: a.id, label: a.name }))]}
        onClose={() => setSheet(null)}
        onPick={(idv) => {
          setValue('paymentAccountId', idv === -1 ? null : idv);
          setSheet(null);
        }}
      />
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="min-h-[52px] flex-row items-center border-b border-gray-100 px-4">
      <Text className="w-36 text-sm text-gray-500">{label}</Text>
      <View className="flex-1 flex-row items-center justify-end">{children}</View>
    </View>
  );
}

function Pick({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="active:bg-gray-50">
      <Field label={label}>
        <Text className="text-base text-gray-900">{value}</Text>
        <Ionicons name="chevron-forward" size={16} color="#9ca3af" style={{ marginLeft: 6 }} />
      </Field>
    </Pressable>
  );
}

function DayField({ control, name, label }: { control: ReturnType<typeof useForm<Values>>['control']; name: 'statementDay' | 'paymentDay'; label: string }) {
  return (
    <Field label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => (
          <TextInput
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="number-pad"
            maxLength={2}
            placeholder={fieldState.error ? '1–31' : '—'}
            placeholderTextColor={fieldState.error ? MM.expense : '#9ca3af'}
            className="w-16 text-right text-base text-gray-900"
          />
        )}
      />
      <Text className="ml-2 text-sm text-gray-500">of the month</Text>
    </Field>
  );
}
