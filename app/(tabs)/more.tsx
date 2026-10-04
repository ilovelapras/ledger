import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import Constants from 'expo-constants';
import { today } from '../../domain/dates';
import { CURRENCIES } from '../../domain/money';
import { exportBackup, journalCsv, resetAll, restoreBackup } from '../../db/backup';
import { migrate } from '../../db/schema';
import { hasEntries, setBaseCurrency, setSetting } from '../../db/settings';
import { useDb, useLedgerQuery, useMutation, useSettings } from '../../hooks/useLedger';
import { ChoiceSheet } from '../../components/mm/Sheets';
import { MM } from '../../components/mm/theme';
import { shareTextFile } from '../../utils/share';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function More() {
  const db = useDb();
  const mutate = useMutation();
  const s = useSettings();
  const locked = useLedgerQuery(hasEntries, []);
  const [sheet, setSheet] = useState<'currency' | 'monthStart' | 'weekStart' | null>(null);

  const backup = () => shareTextFile(`ledger-backup-${today()}.json`, JSON.stringify(exportBackup(db)), 'json');

  const restore = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    let data: unknown;
    try {
      data = JSON.parse(await new File(picked.assets[0].uri).text());
    } catch {
      Alert.alert('Restore failed', 'That file is not a valid backup.');
      return;
    }
    Alert.alert('Replace all data?', 'Everything in the app is replaced by the backup. Photos are not part of backups.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replace',
        style: 'destructive',
        onPress: () => {
          if (mutate((d) => (restoreBackup(d, data), true), 'Restore failed')) Alert.alert('Restored', 'Your backup has been restored.');
        },
      },
    ]);
  };

  const reset = () =>
    Alert.alert('Erase everything?', 'All accounts, transactions and settings are deleted. Make a backup first.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Erase',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Are you sure?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Erase all data',
              style: 'destructive',
              onPress: () => {
                if (mutate((d) => (resetAll(d), migrate(d), true))) router.replace('/onboarding');
              },
            },
          ]),
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: MM.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Section title="Settings">
        <Item icon="pricetags-outline" label="Expense categories" onPress={() => router.push({ pathname: '/settings/categories', params: { type: 'expense' } })} />
        <Item icon="cash-outline" label="Income categories" onPress={() => router.push({ pathname: '/settings/categories', params: { type: 'income' } })} />
        <Item icon="wallet-outline" label="Accounts" onPress={() => router.push('/accounts')} />
        <Item icon="pie-chart-outline" label="Budget setting" onPress={() => router.push('/settings/budgets')} />
        <Item icon="repeat-outline" label="Repeat setting" onPress={() => router.push('/settings/repeat')} />
        <Item icon="star-outline" label="Favourites" onPress={() => router.push('/settings/favorites')} />
      </Section>

      <Section title="Preferences">
        <Item
          icon="globe-outline"
          label="Main currency"
          value={s.baseCurrency}
          onPress={() =>
            locked
              ? Alert.alert('Main currency', 'It is fixed once transactions exist. Accounts can still use other currencies (sub-currencies).')
              : setSheet('currency')
          }
        />
        <Item icon="calendar-outline" label="Month starts on" value={ordinal(s.monthStartDay)} onPress={() => setSheet('monthStart')} />
        <Item icon="today-outline" label="Week starts on" value={s.weekStart === 1 ? 'Monday' : 'Sunday'} onPress={() => setSheet('weekStart')} />
        <Item icon="lock-closed-outline" label="Passcode" value={s.passcodeEnabled ? 'On' : 'Off'} onPress={() => router.push('/settings/passcode')} />
      </Section>

      <Section title="Data">
        <Item icon="cloud-upload-outline" label="Backup (save to Files / iCloud)" onPress={backup} />
        <Item icon="cloud-download-outline" label="Restore from backup" onPress={restore} />
        <Item
          icon="document-text-outline"
          label="Export all to CSV (Excel)"
          onPress={() => shareTextFile(`ledger-all-${today()}.csv`, journalCsv(db, '1900-01-01', '2999-12-31'), 'csv')}
        />
        <Item icon="trash-outline" label="Erase all data" danger onPress={reset} />
      </Section>
      <Text className="px-6 pt-2 text-xs text-gray-500">
        Your data stays on this phone. Back up regularly: reinstalling a sideloaded app can erase it.
      </Text>
      <Text className="mt-6 text-center text-xs text-gray-400">{`Ledger ${Constants.expoConfig?.version ?? ''}`}</Text>

      <ChoiceSheet
        visible={sheet === 'currency'}
        title="Main currency"
        value={s.baseCurrency}
        options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
        onClose={() => setSheet(null)}
        onPick={(c) => {
          mutate((d) => setBaseCurrency(d, c));
          setSheet(null);
        }}
      />
      <ChoiceSheet
        visible={sheet === 'monthStart'}
        title="Month starts on"
        value={s.monthStartDay}
        options={Array.from({ length: 28 }, (_, i) => ({
          value: i + 1,
          label: ordinal(i + 1),
          sub: i === 0 ? 'Calendar month' : `e.g. ${ordinal(i + 1)} of one month to the ${ordinal(i)} of the next`,
        }))}
        onClose={() => setSheet(null)}
        onPick={(n) => {
          mutate((d) => setSetting(d, 'month_start_day', String(n)));
          setSheet(null);
        }}
      />
      <ChoiceSheet
        visible={sheet === 'weekStart'}
        title="Week starts on"
        value={s.weekStart}
        options={[
          { value: 0, label: 'Sunday' },
          { value: 1, label: 'Monday' },
        ]}
        onClose={() => setSheet(null)}
        onPick={(n) => {
          mutate((d) => setSetting(d, 'week_start', String(n)));
          setSheet(null);
        }}
      />
    </ScrollView>
  );
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-4">
      <Text className="px-4 pb-1 text-xs font-semibold uppercase text-gray-500">{title}</Text>
      <View className="bg-white">{children}</View>
    </View>
  );
}

function Item({ icon, label, value, onPress, danger }: { icon: IconName; label: string; value?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center border-b border-gray-100 px-4 py-3.5 active:bg-gray-50">
      <Ionicons name={icon} size={20} color={danger ? MM.expense : '#374151'} />
      <Text className="ml-3 flex-1 text-[15px]" style={{ color: danger ? MM.expense : '#111827' }}>
        {label}
      </Text>
      {value ? <Text className="mr-1 text-sm text-gray-500">{value}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
    </Pressable>
  );
}
