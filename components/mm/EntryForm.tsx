import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { fromISO, toISO } from '../../domain/dates';
import { FREQ_LABELS, FREQS, type Freq } from '../../domain/recurrence';
import { emptyLine, formToEntries, MODE_TO_KIND, type FormMode, type TxFormValues } from '../../domain/txForm';
import { PostingError, validateEntries } from '../../domain/posting';
import { hasOperator, pressKey } from '../../domain/calc';
import type { Account } from '../../domain/types';
import { addAttachment, listAttachments, removeAttachment } from '../../db/attachments';
import { buildFormContext } from '../../db/formContext';
import { listFavorites, saveFavorite } from '../../db/favorites';
import { bookRate } from '../../db/reports';
import { createInstallments, createRepeating } from '../../db/recurrences';
import { setSetting } from '../../db/settings';
import { createTransaction, updateTransaction } from '../../db/transactions';
import { useDb, useLedgerQuery, useMutation, useSettings } from '../../hooks/useLedger';
import { deletePhotoFile, pickReceiptPhoto } from '../../utils/photos';
import { Keypad } from './Keypad';
import { AccountSheet, CategorySheet, ChoiceSheet } from './Sheets';
import { PromptModal } from './PromptModal';
import { MM } from './theme';

export interface EntryValues extends TxFormValues {
  time: string;
  repeat: Freq | 'off';
  repeatEnd: string;
  installments: number;
}

const schema = z
  .object({
    mode: z.enum(['payment', 'receipt', 'transfer', 'journal']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^(\d{2}:\d{2})?$/),
    description: z.string().max(200, 'Keep the note under 200 characters'),
    memo: z.string().max(2000),
    repeat: z.string(),
    repeatEnd: z.string(),
    installments: z.number().int().min(1).max(60),
  })
  .passthrough();

type KeypadField = 'amount' | 'sent' | 'received' | 'fee';
type Sheet = 'category' | 'account' | 'from' | 'to' | 'repeat' | 'installments' | 'favorites' | null;

const MODES: { mode: FormMode; label: string; color: string }[] = [
  { mode: 'receipt', label: 'Income', color: MM.income },
  { mode: 'payment', label: 'Expense', color: MM.expense },
  { mode: 'transfer', label: 'Transfer', color: MM.transfer },
];

interface Props {
  initial: EntryValues;
  editId?: number;
  onSaved: (id: number, again: boolean) => void;
  onOpenPhoto?: (uri: string) => void;
}

export function EntryForm({ initial, editId, onSaved, onOpenPhoto }: Props) {
  const db = useDb();
  const mutate = useMutation();
  const { baseCurrency } = useSettings();
  const ctx = useLedgerQuery((d) => buildFormContext(d), []);
  const favorites = useLedgerQuery(listFavorites, []);

  const { control, setValue, getValues, reset, handleSubmit } = useForm<EntryValues>({
    defaultValues: initial,
    resolver: zodResolver(schema) as never,
  });
  const v = useWatch({ control }) as EntryValues;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [keypad, setKeypad] = useState<KeypadField | null>(editId ? null : 'amount');
  const [photos, setPhotos] = useState<string[]>([]);
  const [favPrompt, setFavPrompt] = useState(false);

  const acc = (id: number | null | undefined): Account | undefined => (id != null ? ctx.accounts.get(id) : undefined);
  const money = acc(v.moneyAccountId);
  const category = acc(v.lines?.[0]?.accountId);
  const from = acc(v.fromId);
  const to = acc(v.toId);
  const isTransfer = v.mode === 'transfer';
  const modeColor = MODES.find((m) => m.mode === v.mode)?.color ?? MM.transfer;
  const amountCurrency = isTransfer ? from?.currency ?? baseCurrency : money?.currency ?? baseCurrency;

  // Prefill the average book rate when money comes from a foreign-currency account.
  useEffect(() => {
    const src = isTransfer ? from : money;
    const field = isTransfer ? 'fromRate' : 'rate';
    if (src && src.currency !== baseCurrency && !getValues(field)) {
      const r = bookRate(db, src.id, getValues('date'));
      if (r) setValue(field, r);
    }
  }, [money?.id, from?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = useMemo(() => {
    // Friendly prompts first; the posting engine's messages cover the rest (rates, invalid amounts…).
    if (isTransfer) {
      if (!from) return 'Choose the account the money comes from.';
      if (!to) return 'Choose the account it goes to.';
      if (!v.sent) return 'Enter the amount.';
    } else {
      if (!money) return 'Choose an account.';
      if (!category) return 'Choose a category.';
      if (!v.lines?.[0]?.amount) return 'Enter the amount.';
    }
    if ([v.lines?.[0]?.amount, v.sent, v.received, v.fee].some((t) => t && hasOperator(t))) return 'Tap = to finish the calculation.';
    try {
      const entries = formToEntries(v, ctx);
      return validateEntries(entries);
    } catch (e) {
      return e instanceof PostingError ? e.message : String(e);
    }
  }, [v, ctx]);

  const setMode = (mode: FormMode) => {
    if (editId || mode === v.mode) return;
    const cur = getValues();
    reset({
      ...cur,
      mode,
      lines: [emptyLine(mode === 'receipt' ? 'cr' : 'dr')],
      fromId: mode === 'transfer' ? cur.moneyAccountId : cur.fromId,
      sent: mode === 'transfer' ? cur.lines[0]?.amount ?? '' : cur.sent,
      installments: 1,
    });
  };

  const amountText = (field: KeypadField) =>
    field === 'amount' ? v.lines?.[0]?.amount ?? '' : (v[field] as string) ?? '';
  const setAmountText = (field: KeypadField, text: string) =>
    field === 'amount' ? setValue('lines.0.amount', text) : setValue(field, text);

  /** Close (or switch) the keypad, finishing any pending "10+5" calculation first. */
  const openKeypad = (next: KeypadField | null) => {
    if (keypad) {
      const text = amountText(keypad);
      if (hasOperator(text)) {
        const cur = keypad === 'received' ? to?.currency ?? baseCurrency : amountCurrency;
        setAmountText(keypad, pressKey(text, '=', cur));
      }
    }
    setKeypad(next);
  };

  const save = (again: boolean) =>
    handleSubmit(
      (values) => {
        const id = mutate((d) => {
          const entries = formToEntries(values, buildFormContext(d));
          const input = {
            date: values.date,
            time: values.time || null,
            kind: MODE_TO_KIND[values.mode],
            description: values.description,
            memo: values.memo,
            entries,
          };
          let txId: number;
          if (editId) {
            updateTransaction(d, editId, input);
            txId = editId;
          } else if (values.mode === 'payment' && values.installments > 1) {
            txId = createInstallments(d, values, values.installments);
          } else if (values.repeat !== 'off') {
            txId = createRepeating(d, values, values.repeat, values.repeatEnd || null);
          } else {
            txId = createTransaction(d, input);
          }
          for (const uri of photos) addAttachment(d, txId, uri);
          // Remember choices for the next entry, like Money Manager.
          if (values.mode !== 'transfer' && values.moneyAccountId) setSetting(d, 'last_money_account', String(values.moneyAccountId));
          return txId;
        });
        if (id == null) return;
        if (again) {
          const keep = getValues();
          reset({
            ...keep,
            lines: [emptyLine(keep.mode === 'receipt' ? 'cr' : 'dr')],
            sent: '',
            received: '',
            fee: '',
            description: '',
            memo: '',
            repeat: 'off',
            repeatEnd: '',
            installments: 1,
          });
          setPhotos([]);
          setKeypad('amount');
        }
        onSaved(id, again);
      },
      () => Alert.alert('Check the entry', 'Some fields are not valid.')
    )();

  const applyFavorite = (id: number) => {
    const f = favorites.find((x) => x.id === id);
    setSheet(null);
    if (!f) return;
    reset({ ...getValues(), ...f.template, date: getValues('date'), reference: '', repeat: 'off', repeatEnd: '', installments: 1 });
  };

  // Saved transactions keep photos in the database; new ones hold them until Save.
  const saved = useLedgerQuery((d) => (editId ? listAttachments(d, editId) : []), [editId]);
  const addPhoto = async (source: 'camera' | 'library') => {
    const uri = await pickReceiptPhoto(source);
    if (!uri) return;
    if (editId) mutate((d) => addAttachment(d, editId, uri));
    else setPhotos((p) => [...p, uri]);
  };
  const removeSaved = (id: number) =>
    Alert.alert('Remove photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const uri = mutate((d) => removeAttachment(d, id));
          if (uri) deletePhotoFile(uri);
        },
      },
    ]);

  return (
    <View className="flex-1 bg-white">
      <Stack.Screen
        options={{
          ...(editId ? {} : { title: MODES.find((m) => m.mode === v.mode)?.label ?? 'New' }),
          headerRight: () =>
            editId ? null : (
              <Pressable onPress={() => setSheet('favorites')} hitSlop={10} accessibilityLabel="Favourites">
                <Ionicons name="star-outline" size={22} color="#111827" />
              </Pressable>
            ),
        }}
      />
      <View className="flex-row gap-2 px-4 pb-2 pt-3">
        {MODES.map((m) => {
          const on = v.mode === m.mode;
          return (
            <Pressable
              key={m.mode}
              disabled={!!editId && !on}
              onPress={() => setMode(m.mode)}
              className="flex-1 items-center rounded-lg border py-2"
              style={{ borderColor: on ? m.color : MM.border, backgroundColor: on ? `${m.color}12` : '#fff', opacity: editId && !on ? 0.4 : 1 }}
            >
              <Text className="text-sm font-semibold" style={{ color: on ? m.color : MM.muted }}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <Row label="Date">
          <View className="flex-1 flex-row items-center justify-end gap-3">
            <PickerField
              mode="date"
              value={fromISO(v.date)}
              label={format(fromISO(v.date), 'EEE d/M/yy')}
              onChange={(d) => setValue('date', toISO(d))}
            />
            {v.time ? (
              <PickerField mode="time" value={timeToDate(v.time)} label={v.time} onChange={(d) => setValue('time', format(d, 'HH:mm'))} />
            ) : (
              <Pressable onPress={() => setValue('time', format(new Date(), 'HH:mm'))} hitSlop={8}>
                <Text className="text-sm" style={{ color: MM.muted }}>
                  + time
                </Text>
              </Pressable>
            )}
          </View>
        </Row>

        {isTransfer ? (
          <>
            <PickRow label="From" value={from?.name} onPress={() => setSheet('from')} />
            <PickRow label="To" value={to?.name} onPress={() => setSheet('to')} />
          </>
        ) : (
          <>
            <PickRow label="Account" value={money?.name} onPress={() => setSheet('account')} />
            <PickRow
              label="Category"
              value={category ? `${category.icon ?? ''} ${parentName(category, ctx.accounts)}${category.name}` : undefined}
              onPress={() => setSheet('category')}
            />
          </>
        )}

        <AmountRow
          label={isTransfer && from && to && from.currency !== to.currency ? `Sent (${from.currency})` : 'Amount'}
          text={amountText(isTransfer ? 'sent' : 'amount')}
          currency={amountCurrency}
          color={modeColor}
          active={keypad === (isTransfer ? 'sent' : 'amount')}
          onPress={() => openKeypad(isTransfer ? 'sent' : 'amount')}
        />
        {isTransfer && from && to && from.currency !== to.currency ? (
          <AmountRow
            label={`Received (${to.currency})`}
            text={amountText('received')}
            currency={to.currency}
            color={modeColor}
            active={keypad === 'received'}
            onPress={() => openKeypad('received')}
          />
        ) : null}
        {isTransfer ? (
          <AmountRow
            label="Fees"
            text={amountText('fee')}
            currency={from?.currency ?? baseCurrency}
            color={MM.expense}
            active={keypad === 'fee'}
            onPress={() => openKeypad('fee')}
          />
        ) : null}

        {!isTransfer && money && money.currency !== baseCurrency ? (
          <RateRow control={control} name="rate" label={`1 ${money.currency} = ? ${baseCurrency}`} />
        ) : null}
        {isTransfer && from && from.currency !== baseCurrency ? (
          <RateRow control={control} name="fromRate" label={`1 ${from.currency} = ? ${baseCurrency}`} />
        ) : null}
        {isTransfer && from && to && to.currency !== baseCurrency && from.currency !== baseCurrency && from.currency !== to.currency ? (
          <RateRow control={control} name="toRate" label={`1 ${to.currency} = ? ${baseCurrency}`} />
        ) : null}

        <Row label="Note">
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                onFocus={() => openKeypad(null)}
                placeholder="e.g. Lunch with team"
                placeholderTextColor="#9ca3af"
                className="flex-1 text-right text-base text-gray-900"
              />
            )}
          />
        </Row>

        {!editId ? (
          <>
            <PickRow
              label="Repeat"
              value={v.repeat === 'off' ? 'Off' : FREQ_LABELS[v.repeat as Freq]}
              onPress={() => setSheet('repeat')}
              disabled={v.installments > 1}
            />
            {v.repeat !== 'off' ? (
              <Row label="Until">
                {v.repeatEnd ? (
                  <View className="flex-row items-center gap-3">
                    <PickerField
                      mode="date"
                      value={fromISO(v.repeatEnd)}
                      label={format(fromISO(v.repeatEnd), 'd MMM yyyy')}
                      onChange={(d) => setValue('repeatEnd', toISO(d))}
                    />
                    <Pressable onPress={() => setValue('repeatEnd', '')} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={MM.muted} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setValue('repeatEnd', v.date)}>
                    <Text className="text-base text-gray-500">No end date</Text>
                  </Pressable>
                )}
              </Row>
            ) : null}
            {v.mode === 'payment' && money?.grp === 'card' ? (
              <PickRow
                label="Instalments"
                value={v.installments > 1 ? `${v.installments} months` : 'One-time'}
                onPress={() => setSheet('installments')}
                disabled={v.repeat !== 'off'}
              />
            ) : null}
          </>
        ) : null}

        <View className="border-b border-gray-100 px-4 py-3">
          <Controller
            control={control}
            name="memo"
            render={({ field }) => (
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                onFocus={() => openKeypad(null)}
                placeholder="Description"
                placeholderTextColor="#9ca3af"
                multiline
                className="min-h-[56px] text-base text-gray-900"
              />
            )}
          />
          <View className="mt-2 flex-row flex-wrap items-center gap-3">
            <Pressable onPress={() => addPhoto('camera')} hitSlop={8} accessibilityLabel="Take photo">
              <Ionicons name="camera-outline" size={24} color={MM.muted} />
            </Pressable>
            <Pressable onPress={() => addPhoto('library')} hitSlop={8} accessibilityLabel="Choose photo">
              <Ionicons name="image-outline" size={24} color={MM.muted} />
            </Pressable>
            {saved.map((p) => (
              <Pressable key={p.id} onPress={() => onOpenPhoto?.(p.uri)} onLongPress={() => removeSaved(p.id)}>
                <Image source={{ uri: p.uri }} style={{ width: 44, height: 44, borderRadius: 6 }} />
              </Pressable>
            ))}
            {photos.map((uri) => (
              <Pressable
                key={uri}
                onPress={() => onOpenPhoto?.(uri)}
                onLongPress={() => {
                  deletePhotoFile(uri);
                  setPhotos((p) => p.filter((x) => x !== uri));
                }}
              >
                <Image source={{ uri }} style={{ width: 44, height: 44, borderRadius: 6 }} />
              </Pressable>
            ))}
            {saved.length + photos.length > 0 ? <Text className="text-[11px] text-gray-400">Hold to remove</Text> : null}
          </View>
        </View>

        {check ? <Text className="px-4 pt-3 text-sm text-gray-500">{check}</Text> : null}
      </ScrollView>

      {keypad ? (
        <Keypad
          value={amountText(keypad)}
          currency={keypad === 'received' ? to?.currency ?? baseCurrency : amountCurrency}
          onChange={(t) => setAmountText(keypad, t)}
          onDone={() => openKeypad(null)}
        />
      ) : (
        <View className="flex-row gap-3 border-t border-gray-200 px-4 pb-8 pt-3">
          <Pressable
            disabled={!!check}
            onPress={() => save(false)}
            className="h-12 flex-[2] items-center justify-center rounded-lg"
            style={{ backgroundColor: modeColor, opacity: check ? 0.4 : 1 }}
          >
            <Text className="text-base font-semibold text-white">Save</Text>
          </Pressable>
          {!editId ? (
            <Pressable
              disabled={!!check}
              onPress={() => save(true)}
              className="h-12 flex-1 items-center justify-center rounded-lg border"
              style={{ borderColor: MM.border, opacity: check ? 0.4 : 1 }}
            >
              <Text className="text-base font-semibold text-gray-800">Continue</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <CategorySheet
        visible={sheet === 'category'}
        type={v.mode === 'receipt' ? 'income' : 'expense'}
        onClose={() => setSheet(null)}
        onPick={(id) => {
          setValue('lines.0.accountId', id);
          setSheet(null);
          if (!amountText('amount')) setKeypad('amount');
        }}
      />
      <AccountSheet
        visible={sheet === 'account' || sheet === 'from' || sheet === 'to'}
        title={sheet === 'from' ? 'From' : sheet === 'to' ? 'To' : 'Account'}
        exclude={sheet === 'to' ? v.fromId : sheet === 'from' ? v.toId : null}
        onClose={() => setSheet(null)}
        onPick={(a) => {
          if (sheet === 'account') setValue('moneyAccountId', a.id);
          if (sheet === 'from') setValue('fromId', a.id);
          if (sheet === 'to') setValue('toId', a.id);
          setSheet(null);
        }}
      />
      <ChoiceSheet
        visible={sheet === 'repeat'}
        title="Repeat"
        value={v.repeat}
        options={[{ value: 'off', label: 'Off' }, ...FREQS.map((f) => ({ value: f, label: FREQ_LABELS[f] }))]}
        onClose={() => setSheet(null)}
        onPick={(f) => {
          setValue('repeat', f as EntryValues['repeat']);
          setSheet(null);
        }}
      />
      <ChoiceSheet
        visible={sheet === 'installments'}
        title="Instalments"
        value={v.installments}
        options={[1, 2, 3, 4, 5, 6, 9, 10, 12, 18, 24, 36].map((n) => ({
          value: n,
          label: n === 1 ? 'One-time payment' : `${n} months`,
          sub: n > 1 ? 'Split into equal monthly expenses on this card' : undefined,
        }))}
        onClose={() => setSheet(null)}
        onPick={(n) => {
          setValue('installments', n);
          setSheet(null);
        }}
      />
      <ChoiceSheet
        visible={sheet === 'favorites'}
        title="Favourites"
        value={null}
        options={[
          { value: -1, label: '★ Save this entry as a favourite' },
          ...favorites.map((f) => ({ value: f.id, label: f.name, sub: f.kind === 'receipt' ? 'Income' : f.kind === 'payment' ? 'Expense' : 'Transfer' })),
        ]}
        onClose={() => setSheet(null)}
        onPick={(id) => {
          if (id === -1) {
            setSheet(null);
            setFavPrompt(true);
          } else applyFavorite(id);
        }}
      />
      <PromptModal
        visible={favPrompt}
        title="Save favourite"
        message="Saves the account, category, amount and note for one-tap entry."
        initial={v.description || category?.name || ''}
        placeholder="Name"
        confirmLabel="Save"
        onCancel={() => setFavPrompt(false)}
        onSubmit={(name) => {
          if (mutate((d) => saveFavorite(d, name, getValues()))) setFavPrompt(false);
        }}
      />
    </View>
  );
}

/**
 * iOS: inline compact picker. Android: the picker is a dialog that opens whenever it renders,
 * so show a text button and render the dialog only after a tap.
 */
function PickerField({ mode, value, label, onChange }: { mode: 'date' | 'time'; value: Date; label: string; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'ios') {
    return <DateTimePicker value={value} mode={mode} display="compact" onChange={(_, d) => d && onChange(d)} />;
  }
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6}>
        <Text className="text-base text-gray-900">{label}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={value}
          mode={mode}
          onChange={(_, d) => {
            setOpen(false);
            if (d) onChange(d);
          }}
        />
      ) : null}
    </>
  );
}

function timeToDate(time: string): Date {
  const d = new Date();
  if (/^\d{2}:\d{2}$/.test(time)) d.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0);
  return d;
}

function parentName(a: Account, accounts: Map<number, Account>): string {
  const p = a.parent_id != null ? accounts.get(a.parent_id) : undefined;
  return p ? `${p.name} › ` : '';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="min-h-[52px] flex-row items-center border-b border-gray-100 px-4">
      <Text className="w-24 text-sm text-gray-500">{label}</Text>
      <View className="flex-1 flex-row items-center justify-end">{children}</View>
    </View>
  );
}

function PickRow({ label, value, onPress, disabled }: { label: string; value?: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} className="active:bg-gray-50" style={{ opacity: disabled ? 0.4 : 1 }}>
      <Row label={label}>
        <Text numberOfLines={1} className={`text-base ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          {value ?? 'Choose'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#9ca3af" style={{ marginLeft: 6 }} />
      </Row>
    </Pressable>
  );
}

function AmountRow({
  label,
  text,
  currency,
  color,
  active,
  onPress,
}: {
  label: string;
  text: string;
  currency: string;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <View className="min-h-[56px] flex-row items-center border-b px-4" style={{ borderColor: active ? color : '#f3f4f6', borderBottomWidth: active ? 2 : 1 }}>
        <Text className="w-24 text-sm text-gray-500">{label}</Text>
        <Text className="flex-1 text-right text-2xl font-semibold" style={{ color: text ? color : '#d1d5db', fontVariant: ['tabular-nums'] }}>
          {text || '0'}
        </Text>
        <Text className="ml-2 text-sm text-gray-500">{currency}</Text>
      </View>
    </Pressable>
  );
}

function RateRow({ control, name, label }: { control: ReturnType<typeof useForm<EntryValues>>['control']; name: 'rate' | 'fromRate' | 'toRate'; label: string }) {
  return (
    <Row label="Rate">
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <View className="flex-1 flex-row items-center justify-end gap-2">
            <Text className="text-xs text-gray-500">{label}</Text>
            <TextInput
              value={field.value}
              onChangeText={field.onChange}
              keyboardType="decimal-pad"
              placeholder="1.00"
              placeholderTextColor="#9ca3af"
              className="w-24 text-right text-base text-gray-900"
            />
          </View>
        )}
      />
    </Row>
  );
}
