import React, { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Controller, useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isBalanceSheetType, isMoneyAccount, KIND_LABELS } from '../../domain/accounting';
import { formatMoney } from '../../domain/money';
import { totals, PostingError, validateEntries } from '../../domain/posting';
import { emptyForm, emptyLine, formToEntries, MODE_TO_KIND, type FormContext, type FormMode, type TxFormValues } from '../../domain/txForm';
import type { Account, EntryInput, TxKind } from '../../domain/types';
import { requireAccountByCode } from '../../db/accounts';
import { listPayees, ensurePayee } from '../../db/payees';
import { bookRate } from '../../db/reports';
import { SYSTEM_CODES } from '../../db/seed';
import { peekReference } from '../../db/settings';
import { createTransaction, updateTransaction } from '../../db/transactions';
import { useDb, useLedgerQuery, useMutation, useSettings } from '../../hooks/useLedger';
import { AccountPicker, useAccountMap } from '../AccountPicker';
import { Banner, Button, DateField, Input, Segmented, Select } from '../ui';

const lineSchema = z.object({
  accountId: z.number().nullable(),
  amount: z.string(),
  side: z.enum(['dr', 'cr']),
  rate: z.string(),
  memo: z.string().max(200),
});

const formSchema = z.object({
  mode: z.enum(['payment', 'receipt', 'transfer', 'journal']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  reference: z.string().max(40, 'Keep the reference under 40 characters'),
  payeeName: z.string().max(80),
  description: z.string().max(200, 'Keep the description under 200 characters'),
  memo: z.string().max(1000),
  moneyAccountId: z.number().nullable(),
  rate: z.string(),
  lines: z.array(lineSchema),
  fromId: z.number().nullable(),
  toId: z.number().nullable(),
  sent: z.string(),
  received: z.string(),
  fromRate: z.string(),
  toRate: z.string(),
  fee: z.string(),
});

const MODES: { value: FormMode; label: string }[] = [
  { value: 'payment', label: 'Payment' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'journal', label: 'Journal' },
];

interface Props {
  initial: TxFormValues;
  /** When editing: the transaction id. */
  editId?: number;
  /** Original kind when editing opening balances or reversals (shown as journal). */
  fixedKind?: TxKind;
  onSaved: (id: number) => void;
}

/** Accounts and system accounts the form needs; null if a system account was deleted. */
export function useTxFormContext(): FormContext | null {
  const db = useDb();
  const { baseCurrency } = useSettings();
  const accounts = useAccountMap();
  return useMemo<FormContext | null>(() => {
    try {
      return {
        baseCurrency,
        accounts,
        fxGain: requireAccountByCode(db, SYSTEM_CODES.fxGain),
        fxLoss: requireAccountByCode(db, SYSTEM_CODES.fxLoss),
        bankCharges: requireAccountByCode(db, SYSTEM_CODES.bankCharges),
      };
    } catch {
      return null;
    }
  }, [db, baseCurrency, accounts]);
}

export function TransactionForm({ initial, editId, fixedKind, onSaved }: Props) {
  const db = useDb();
  const mutate = useMutation();
  const { baseCurrency } = useSettings();
  const accounts = useAccountMap();
  const payees = useLedgerQuery(listPayees, []);
  const ctx = useTxFormContext();

  const { control, handleSubmit, reset, setValue, getValues, formState } = useForm<TxFormValues>({
    defaultValues: initial,
    resolver: zodResolver(formSchema),
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const values = useWatch({ control }) as TxFormValues;
  const mode = values.mode;
  const kind: TxKind = fixedKind ?? MODE_TO_KIND[mode];

  // Live posting preview: the exact lines that will be saved, or why it can't be saved yet.
  const preview = useMemo<{ entries: EntryInput[] | null; error: string | null }>(() => {
    if (!ctx) return { entries: null, error: 'A system account (FX gain/loss or bank charges) is missing.' };
    try {
      const entries = formToEntries(values, ctx);
      return { entries, error: validateEntries(entries) };
    } catch (e) {
      return { entries: null, error: e instanceof PostingError ? e.message : String(e) };
    }
  }, [values, ctx]);

  const acct = (id: number | null | undefined): Account | undefined => (id != null ? accounts.get(id) : undefined);
  const money = acct(values.moneyAccountId);
  const from = acct(values.fromId);
  const to = acct(values.toId);

  // Prefill the book rate when money leaves a foreign-currency account.
  useEffect(() => {
    if (from && from.currency !== baseCurrency && !getValues('fromRate')) {
      const r = bookRate(db, from.id, getValues('date'));
      if (r) setValue('fromRate', r);
    }
  }, [from?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (money && money.currency !== baseCurrency && !getValues('rate')) {
      const r = bookRate(db, money.id, getValues('date'));
      if (r) setValue('rate', r);
    }
  }, [money?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = (m: FormMode) => {
    const cur = getValues();
    reset({ ...emptyForm(m, cur.date), date: cur.date, payeeName: cur.payeeName, description: cur.description, memo: cur.memo });
  };

  const save = (andNew: boolean) =>
    handleSubmit((v) => {
      if (!ctx) return;
      const id = mutate((d) => {
        const entries = formToEntries(v, ctx);
        const input = {
          date: v.date,
          kind,
          reference: v.reference,
          payee_id: ensurePayee(d, v.payeeName),
          description: v.description,
          memo: v.memo,
          entries,
        };
        if (editId) {
          updateTransaction(d, editId, input);
          return editId;
        }
        return createTransaction(d, input);
      });
      if (id == null) return;
      if (andNew) {
        // Keep date, type and the bank/card for fast batch entry.
        reset({
          ...emptyForm(v.mode, v.date),
          moneyAccountId: v.moneyAccountId,
          rate: v.rate,
          fromId: v.fromId,
          fromRate: v.fromRate,
        });
      } else {
        onSaved(id);
      }
    })();

  const payeeOptions = useMemo(() => {
    const opts = payees.map((p) => ({ value: p.name, label: p.name, sublabel: p.default_account_id ? acct(p.default_account_id)?.name : undefined }));
    if (values.payeeName && !opts.some((o) => o.value === values.payeeName))
      opts.unshift({ value: values.payeeName, label: values.payeeName, sublabel: 'New payee' });
    return opts;
  }, [payees, values.payeeName]); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePayee = (name: string) => {
    setValue('payeeName', name);
    const p = payees.find((x) => x.name === name);
    const lines = getValues('lines');
    if (p?.default_account_id && (mode === 'payment' || mode === 'receipt') && lines.length && lines[0].accountId == null) {
      setValue('lines.0.accountId', p.default_account_id);
    }
  };

  const canSave = !!preview.entries && !preview.error;
  const nextRef = useMemo(() => peekReference(db, kind), [db, kind, formState.submitCount]);
  // A saved transaction keeps its type (and reference prefix); only new entries can switch.
  const showModes = !editId;

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        {showModes ? (
          <View className="px-4 pt-4">
            <Segmented options={MODES} value={mode} onChange={switchMode} />
          </View>
        ) : fixedKind ? (
          <Banner tone="info">{`${KIND_LABELS[fixedKind]} — edited as journal lines.`}</Banner>
        ) : null}

        <Group>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Controller
                control={control}
                name="date"
                render={({ field, fieldState }) => (
                  <DateField label="Date" value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
                )}
              />
            </View>
            <View className="flex-1">
              <Controller
                control={control}
                name="reference"
                render={({ field, fieldState }) => (
                  <Input
                    label="Reference"
                    value={field.value}
                    onChangeText={field.onChange}
                    placeholder={editId ? '' : nextRef}
                    autoCapitalize="characters"
                    error={fieldState.error?.message}
                    helperText={editId ? undefined : 'Blank = next number'}
                  />
                )}
              />
            </View>
          </View>
          {mode !== 'transfer' ? (
            <Select
              label={mode === 'receipt' ? 'Received from' : mode === 'payment' ? 'Paid to' : 'Payee (optional)'}
              title="Payee"
              placeholder="Choose or add a payee"
              options={payeeOptions}
              value={values.payeeName || null}
              onChange={choosePayee}
              onCreate={choosePayee}
            />
          ) : null}
        </Group>

        {mode === 'payment' || mode === 'receipt' ? (
          <Group title={mode === 'payment' ? 'Money out' : 'Money in'}>
            <Controller
              control={control}
              name="moneyAccountId"
              render={({ field }) => (
                <AccountPicker
                  label={mode === 'payment' ? 'Paid from' : 'Deposited into'}
                  value={field.value}
                  onChange={field.onChange}
                  filter={isMoneyAccount}
                />
              )}
            />
            {money && money.currency !== baseCurrency ? (
              <RateInput control={control} name="rate" label={`Rate: 1 ${money.currency} = ? ${baseCurrency}`} />
            ) : null}
          </Group>
        ) : null}

        {mode === 'payment' || mode === 'receipt' || mode === 'journal' ? (
          <Group title={mode === 'journal' ? 'Lines' : mode === 'payment' ? 'What it was for' : 'What it was for'}>
            {fields.map((f, i) => {
              const line = values.lines?.[i];
              const lineAcct = acct(line?.accountId);
              const currency = mode === 'journal' ? lineAcct?.currency ?? baseCurrency : money?.currency ?? baseCurrency;
              return (
                <View key={f.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  {mode === 'journal' ? (
                    <Controller
                      control={control}
                      name={`lines.${i}.side`}
                      render={({ field }) => (
                        <Segmented
                          className="mb-2"
                          options={[
                            { value: 'dr', label: 'Debit' },
                            { value: 'cr', label: 'Credit' },
                          ]}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  ) : null}
                  <Controller
                    control={control}
                    name={`lines.${i}.accountId`}
                    render={({ field }) => (
                      <AccountPicker
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={mode === 'receipt' ? 'Income or other account' : mode === 'payment' ? 'Expense or other account' : 'Account'}
                        exclude={values.moneyAccountId != null && mode !== 'journal' ? [values.moneyAccountId] : []}
                        filter={(a) =>
                          mode === 'journal' ||
                          a.currency === baseCurrency ||
                          (money != null && a.currency === money.currency)
                        }
                      />
                    )}
                  />
                  <View className="mt-2 flex-row gap-2">
                    <View className="flex-1">
                      <AmountInput control={control} name={`lines.${i}.amount`} currency={currency} />
                    </View>
                    {mode === 'journal' && lineAcct && lineAcct.currency !== baseCurrency ? (
                      <View className="w-28">
                        <Controller
                          control={control}
                          name={`lines.${i}.rate`}
                          render={({ field }) => (
                            <Input value={field.value} onChangeText={field.onChange} placeholder="Rate" keyboardType="decimal-pad" />
                          )}
                        />
                      </View>
                    ) : null}
                  </View>
                  <View className="mt-2 flex-row items-center gap-2">
                    <View className="flex-1">
                      <Controller
                        control={control}
                        name={`lines.${i}.memo`}
                        render={({ field }) => (
                          <Input value={field.value} onChangeText={field.onChange} placeholder="Line memo (optional)" />
                        )}
                      />
                    </View>
                    {fields.length > (mode === 'journal' ? 2 : 1) ? (
                      <Pressable onPress={() => remove(i)} hitSlop={8} accessibilityLabel={`Remove line ${i + 1}`}>
                        <Text className="text-sm font-semibold text-red-600">Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
            <Button variant="outline" size="sm" onPress={() => append(emptyLine(mode === 'journal' ? 'dr' : 'dr'))}>
              {mode === 'journal' ? '+ Add line' : '+ Split'}
            </Button>
          </Group>
        ) : null}

        {mode === 'transfer' ? (
          <Group title="Transfer">
            <Controller
              control={control}
              name="fromId"
              render={({ field }) => (
                <AccountPicker label="From" value={field.value} onChange={field.onChange} filter={(a) => isBalanceSheetType(a.type) && a.type !== 'equity'} />
              )}
            />
            <Controller
              control={control}
              name="toId"
              render={({ field }) => (
                <AccountPicker
                  label="To"
                  value={field.value}
                  onChange={field.onChange}
                  filter={(a) => isBalanceSheetType(a.type) && a.type !== 'equity'}
                  exclude={values.fromId != null ? [values.fromId] : []}
                />
              )}
            />
            <AmountInput control={control} name="sent" currency={from?.currency ?? baseCurrency} label="Amount sent" />
            {from && to && from.currency !== to.currency ? (
              <AmountInput control={control} name="received" currency={to.currency} label="Amount received" />
            ) : null}
            {from && from.currency !== baseCurrency ? (
              <RateInput
                control={control}
                name="fromRate"
                label={`Book rate: 1 ${from.currency} = ? ${baseCurrency}`}
                helper="Prefilled with the account's average rate. A different sale rate shows as exchange gain/loss."
              />
            ) : null}
            {from && to && from.currency !== to.currency && from.currency !== baseCurrency && to.currency !== baseCurrency ? (
              <RateInput control={control} name="toRate" label={`Rate: 1 ${to.currency} = ? ${baseCurrency}`} />
            ) : null}
            <AmountInput control={control} name="fee" currency={from?.currency ?? baseCurrency} label="Bank fee (optional)" />
          </Group>
        ) : null}

        <Group title="Details">
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState }) => (
              <Input label="Description" value={field.value} onChangeText={field.onChange} placeholder="e.g. Weekly groceries" error={fieldState.error?.message} />
            )}
          />
          <Controller
            control={control}
            name="memo"
            render={({ field }) => (
              <Input label="Notes" value={field.value} onChangeText={field.onChange} multiline placeholder="Optional" className="min-h-[64px]" />
            )}
          />
        </Group>

        <PostingPreview entries={preview.entries} error={preview.error} accounts={accounts} baseCurrency={baseCurrency} />
      </ScrollView>

      <View className="flex-row gap-3 border-t border-gray-200 bg-white px-4 pb-8 pt-3">
        {!editId ? (
          <Button variant="outline" className="flex-1" disabled={!canSave} onPress={() => save(true)}>
            Save & new
          </Button>
        ) : null}
        <Button className="flex-1" disabled={!canSave} onPress={() => save(false)}>
          {editId ? 'Save changes' : 'Save'}
        </Button>
      </View>
    </View>
  );
}

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View className="mx-4 mt-4 gap-3 rounded-xl border border-gray-200 bg-white p-4">
      {title ? <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</Text> : null}
      {children}
    </View>
  );
}

function AmountInput({
  control,
  name,
  currency,
  label,
}: {
  control: Control<TxFormValues>;
  name: `lines.${number}.amount` | 'sent' | 'received' | 'fee';
  currency: string;
  label?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Input
          label={label}
          value={field.value as string}
          onChangeText={field.onChange}
          placeholder="0.00"
          keyboardType="numbers-and-punctuation"
          right={<Text className="text-sm font-medium text-gray-500">{currency}</Text>}
          className="text-right"
          style={{ fontVariant: ['tabular-nums'] }}
        />
      )}
    />
  );
}

function RateInput({
  control,
  name,
  label,
  helper,
}: {
  control: Control<TxFormValues>;
  name: 'rate' | 'fromRate' | 'toRate';
  label: string;
  helper?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Input label={label} value={field.value} onChangeText={field.onChange} placeholder="e.g. 1.35" keyboardType="decimal-pad" helperText={helper} />
      )}
    />
  );
}

function PostingPreview({
  entries,
  error,
  accounts,
  baseCurrency,
}: {
  entries: EntryInput[] | null;
  error: string | null;
  accounts: Map<number, Account>;
  baseCurrency: string;
}) {
  const t = entries ? totals(entries) : null;
  return (
    <View className="mx-4 mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Posting preview</Text>
      {entries ? (
        <>
          <View className="flex-row border-b border-gray-200 pb-1">
            <Text className="flex-1 text-xs font-semibold text-gray-500">Account</Text>
            <Text className="w-24 text-right text-xs font-semibold text-gray-500">Debit</Text>
            <Text className="w-24 text-right text-xs font-semibold text-gray-500">Credit</Text>
          </View>
          {entries.map((e, i) => {
            const a = accounts.get(e.account_id);
            return (
              <View key={i} className="flex-row border-b border-gray-100 py-1.5">
                <View className="flex-1 pr-2">
                  <Text className="text-sm text-gray-900" numberOfLines={1}>
                    {a ? `${a.code} ${a.name}` : '?'}
                  </Text>
                  {e.currency !== baseCurrency ? (
                    <Text className="text-xs text-gray-500">
                      {formatMoney(e.fx_amount, e.currency)} @ {e.fx_rate}
                    </Text>
                  ) : null}
                </View>
                <Text className="w-24 text-right text-sm text-gray-900" style={{ fontVariant: ['tabular-nums'] }}>
                  {e.debit ? formatMoney(e.debit, baseCurrency, { code: false }) : ''}
                </Text>
                <Text className="w-24 text-right text-sm text-gray-900" style={{ fontVariant: ['tabular-nums'] }}>
                  {e.credit ? formatMoney(e.credit, baseCurrency, { code: false }) : ''}
                </Text>
              </View>
            );
          })}
          <View className="flex-row pt-1.5">
            <Text className="flex-1 text-sm font-semibold text-gray-900">Total {baseCurrency}</Text>
            <Text className="w-24 text-right text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(t!.debit, baseCurrency, { code: false })}
            </Text>
            <Text className="w-24 text-right text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(t!.credit, baseCurrency, { code: false })}
            </Text>
          </View>
          {error ? (
            <Text className="mt-2 text-sm font-semibold text-red-600">{error}</Text>
          ) : t!.difference !== 0 ? (
            <Text className="mt-2 text-sm font-semibold text-red-600">
              Out of balance by {formatMoney(t!.difference, baseCurrency)}
            </Text>
          ) : (
            <Text className="mt-2 text-sm font-medium text-primary-700">✓ Balanced</Text>
          )}
        </>
      ) : (
        <Text className="text-sm text-gray-500">{error}</Text>
      )}
    </View>
  );
}
