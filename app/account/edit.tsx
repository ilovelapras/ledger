import React, { useEffect, useMemo } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, SUBTYPE_LABELS, SUBTYPES_BY_TYPE } from '../../domain/accounting';
import { CURRENCIES } from '../../domain/money';
import type { AccountSubtype, AccountType } from '../../domain/types';
import { createAccount, deleteAccount, getAccount, setAccountActive, suggestCode, updateAccount } from '../../db/accounts';
import { useDb, useMutation, useSettings } from '../../hooks/useLedger';
import { AccountPicker } from '../../components/AccountPicker';
import { Button, Input, Segmented, Select } from '../../components/ui';

const schema = z.object({
  type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
  subtype: z.enum(['bank', 'cash', 'credit_card', 'loan', 'investment', 'receivable', 'payable', 'property', 'general']),
  parent_id: z.number().nullable(),
  code: z.string().regex(/^\d{4,6}$/, '4–6 digits'),
  name: z.string().trim().min(1, 'Required').max(80),
  currency: z.string().length(3),
  is_placeholder: z.boolean(),
  institution: z.string().max(80),
  account_no: z.string().max(8, 'Last 4 digits are enough'),
  notes: z.string().max(500),
});
type Values = z.infer<typeof schema>;

export default function EditAccount() {
  const { id, type: typeParam } = useLocalSearchParams<{ id?: string; type?: string }>();
  const db = useDb();
  const mutate = useMutation();
  const { baseCurrency } = useSettings();
  const existing = useMemo(() => (id ? getAccount(db, Number(id)) : null), [db, id]);

  const startType = (existing?.type ?? (ACCOUNT_TYPES.includes(typeParam as AccountType) ? typeParam : 'asset')) as AccountType;
  const { control, handleSubmit, setValue, getValues } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? {
          type: existing.type,
          subtype: existing.subtype,
          parent_id: existing.parent_id,
          code: existing.code,
          name: existing.name,
          currency: existing.currency,
          is_placeholder: !!existing.is_placeholder,
          institution: existing.institution ?? '',
          account_no: existing.account_no ?? '',
          notes: existing.notes ?? '',
        }
      : {
          type: startType,
          subtype: SUBTYPES_BY_TYPE[startType][0],
          parent_id: null,
          code: suggestCode(db, startType, null),
          name: '',
          currency: baseCurrency,
          is_placeholder: false,
          institution: '',
          account_no: '',
          notes: '',
        },
  });
  const type = useWatch({ control, name: 'type' });
  const subtype = useWatch({ control, name: 'subtype' });
  const parentId = useWatch({ control, name: 'parent_id' });
  const multiCurrency = type === 'asset' || type === 'liability';

  // Keep code/subtype/currency consistent when type or parent changes on a new account.
  useEffect(() => {
    if (existing) return;
    if (!SUBTYPES_BY_TYPE[type].includes(getValues('subtype'))) setValue('subtype', SUBTYPES_BY_TYPE[type][0]);
    if (!multiCurrency) setValue('currency', baseCurrency);
    setValue('code', suggestCode(db, type, parentId));
  }, [type, parentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = handleSubmit((v) => {
    const input = { ...v, subtype: v.subtype as AccountSubtype };
    const ok = mutate((d) => {
      if (existing) updateAccount(d, existing.id, input);
      else createAccount(d, input);
      return true;
    });
    if (ok) router.back();
  });

  const remove = () =>
    Alert.alert('Delete account?', 'Only possible for accounts that have never been used.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (mutate((d) => (deleteAccount(d, existing!.id), true), 'Could not delete')) router.dismissTo('/accounts');
        },
      },
    ]);

  const toggleActive = () => {
    if (mutate((d) => (setAccountActive(d, existing!.id, !existing!.is_active), true))) router.back();
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? 'Edit account' : 'New account' }} />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <View>
            <Text className="mb-1 text-sm font-medium text-gray-700">Type</Text>
            <Segmented
              options={ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t].replace('Liabilities', 'Liab.') }))}
              value={field.value}
              onChange={(t) => {
                field.onChange(t);
                setValue('parent_id', null);
              }}
            />
          </View>
        )}
      />
      {SUBTYPES_BY_TYPE[type].length > 1 ? (
        <Controller
          control={control}
          name="subtype"
          render={({ field }) => (
            <Select
              label="Kind of account"
              searchable={false}
              options={SUBTYPES_BY_TYPE[type].map((s) => ({ value: s, label: SUBTYPE_LABELS[s] }))}
              value={field.value}
              onChange={field.onChange}
              helperText="Bank, cash, card, loan and investment accounts appear as 'paid from / into' choices."
            />
          )}
        />
      ) : null}
      <Controller
        control={control}
        name="parent_id"
        render={({ field }) => (
          <View>
            <AccountPicker
              label="Parent (optional)"
              placeholder="Top level"
              value={field.value}
              onChange={field.onChange}
              allowHeaders
              filter={(a) => a.type === type && !!a.is_placeholder && a.id !== existing?.id}
            />
            {field.value != null ? (
              <Text onPress={() => field.onChange(null)} className="mt-1 text-sm text-primary-700">
                Move to top level
              </Text>
            ) : null}
          </View>
        )}
      />
      <View className="flex-row gap-3">
        <View className="w-28">
          <Controller
            control={control}
            name="code"
            render={({ field, fieldState }) => (
              <Input label="Code" value={field.value} onChangeText={field.onChange} keyboardType="number-pad" error={fieldState.error?.message} />
            )}
          />
        </View>
        <View className="flex-1">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <Input label="Name" value={field.value} onChangeText={field.onChange} placeholder="e.g. DBS Multiplier" error={fieldState.error?.message} />
            )}
          />
        </View>
      </View>
      {multiCurrency ? (
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              label="Currency"
              options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
              value={field.value}
              onChange={field.onChange}
              helperText={field.value !== baseCurrency ? `Balances are kept in ${field.value} and converted to ${baseCurrency} for reports.` : undefined}
            />
          )}
        />
      ) : null}
      {subtype === 'bank' || subtype === 'credit_card' || subtype === 'loan' || subtype === 'investment' ? (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Controller
              control={control}
              name="institution"
              render={({ field }) => <Input label="Bank / institution" value={field.value} onChangeText={field.onChange} placeholder="e.g. DBS" />}
            />
          </View>
          <View className="w-28">
            <Controller
              control={control}
              name="account_no"
              render={({ field, fieldState }) => (
                <Input label="Last 4" value={field.value} onChangeText={field.onChange} keyboardType="number-pad" maxLength={8} error={fieldState.error?.message} />
              )}
            />
          </View>
        </View>
      ) : null}
      <Controller
        control={control}
        name="is_placeholder"
        render={({ field }) => (
          <View className="flex-row items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-3">
            <View className="mr-3 flex-1">
              <Text className="text-base text-gray-900">Header account</Text>
              <Text className="text-xs text-gray-500">Groups sub-accounts; nothing can be posted to it directly.</Text>
            </View>
            <Switch value={field.value} onValueChange={field.onChange} />
          </View>
        )}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field }) => <Input label="Notes" value={field.value} onChangeText={field.onChange} multiline className="min-h-[64px]" />}
      />
      <Button size="lg" onPress={submit}>
        {existing ? 'Save changes' : 'Create account'}
      </Button>
      {existing ? (
        <>
          <Button variant="outline" onPress={toggleActive}>
            {existing.is_active ? 'Deactivate (hide from pickers)' : 'Reactivate'}
          </Button>
          <Button variant="ghost" onPress={remove}>
            <Text className="font-semibold text-red-600">Delete account</Text>
          </Button>
        </>
      ) : null}
    </ScrollView>
  );
}
