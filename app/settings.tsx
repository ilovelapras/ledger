import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import Constants from 'expo-constants';
import { displayDate, presetRange, today } from '../domain/dates';
import { CURRENCIES } from '../domain/money';
import { exportBackup, journalCsv, resetAll, restoreBackup } from '../db/backup';
import { migrate } from '../db/schema';
import { hasEntries, setBaseCurrency, setSetting } from '../db/settings';
import { useDb, useLedgerQuery, useMutation, useSettings } from '../hooks/useLedger';
import { Button, DateField, Input, ListRow, SectionTitle, Select } from '../components/ui';
import { shareTextFile } from '../utils/share';

export default function Settings() {
  const db = useDb();
  const mutate = useMutation();
  const settings = useSettings();
  const locked = useLedgerQuery(hasEntries, []);
  const [name, setName] = useState(settings.ownerName);

  const backup = () =>
    shareTextFile(`ledger-backup-${today()}.json`, JSON.stringify(exportBackup(db)), 'json');

  const restore = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    let data: unknown;
    try {
      data = JSON.parse(await new File(picked.assets[0].uri).text());
    } catch {
      Alert.alert('Restore failed', 'That file is not valid JSON.');
      return;
    }
    Alert.alert('Replace all data?', 'Everything in the app will be replaced by the backup. This cannot be undone.', [
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
    Alert.alert('Erase everything?', 'All accounts, transactions and settings will be deleted. Export a backup first.', [
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

  const year = presetRange('this_year');

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <SectionTitle>Books</SectionTitle>
      <View className="mx-4 gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <Input
          label="Owner"
          value={name}
          onChangeText={setName}
          onEndEditing={() => mutate((d) => setSetting(d, 'owner_name', name.trim()))}
          returnKeyType="done"
        />
        <Select
          label="Base currency"
          options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
          value={settings.baseCurrency}
          onChange={(c) => mutate((d) => setBaseCurrency(d, c))}
          disabled={locked}
          helperText={locked ? 'Fixed once transactions are recorded.' : undefined}
        />
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Lock date</Text>
          <Text className="mb-2 text-xs text-gray-500">
            {settings.lockDate
              ? `Transactions on or before ${displayDate(settings.lockDate)} cannot be added, edited or voided.`
              : 'No lock. Lock a period once it is reviewed so it cannot change by accident.'}
          </Text>
          <View className="flex-row items-center gap-3">
            <DateField inline value={settings.lockDate || today()} onChange={(d) => mutate((x) => setSetting(x, 'lock_date', d))} />
            {settings.lockDate ? (
              <Button size="sm" variant="ghost" onPress={() => mutate((x) => setSetting(x, 'lock_date', ''))}>
                Remove lock
              </Button>
            ) : null}
          </View>
        </View>
      </View>

      <SectionTitle>Set-up</SectionTitle>
      <View className="mx-4 overflow-hidden rounded-xl border border-gray-200">
        <ListRow title="Opening balances" subtitle="Starting balances for banks, cards and loans" onPress={() => router.push('/opening')} right={<Text className="text-gray-400">›</Text>} />
        <ListRow title="Payees" subtitle="Rename, set default categories, remove" onPress={() => router.push('/payees')} right={<Text className="text-gray-400">›</Text>} />
        <ListRow title="Chart of accounts" subtitle="Add, edit or deactivate accounts" onPress={() => router.push('/accounts')} right={<Text className="text-gray-400">›</Text>} />
      </View>

      <SectionTitle>Data</SectionTitle>
      <View className="mx-4 gap-2">
        <Button variant="outline" onPress={backup}>
          Export backup (JSON)
        </Button>
        <Button variant="outline" onPress={restore}>
          Restore from backup
        </Button>
        <Button variant="outline" onPress={() => shareTextFile(`journal-${year.from.slice(0, 4)}.csv`, journalCsv(db, year.from, year.to), 'csv')}>
          Export this year's journal (CSV)
        </Button>
        <Button variant="outline" onPress={() => shareTextFile('journal-all.csv', journalCsv(db, '1900-01-01', '2999-12-31'), 'csv')}>
          Export full journal (CSV)
        </Button>
        <Text className="text-xs text-gray-500">
          Data lives only on this phone. Export a backup regularly and save it to Files or iCloud Drive; reinstalling the app
          (e.g. after a sideload certificate expires) can erase it.
        </Text>
      </View>

      <SectionTitle>Danger zone</SectionTitle>
      <View className="mx-4">
        <Button variant="danger" onPress={reset}>
          Erase all data
        </Button>
      </View>
      <Text className="mt-6 text-center text-xs text-gray-400">{`Ledger ${Constants.expoConfig?.version ?? ''}`}</Text>
    </ScrollView>
  );
}
