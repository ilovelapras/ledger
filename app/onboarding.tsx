import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CURRENCIES } from '../domain/money';
import { setBaseCurrency, setSetting } from '../db/settings';
import { useMutation, useSettings } from '../hooks/useLedger';
import { Button, Card, Input, Select } from '../components/ui';

export default function Onboarding() {
  const settings = useSettings();
  const mutate = useMutation();
  const [name, setName] = useState(settings.ownerName);
  const [currency, setCurrency] = useState(settings.baseCurrency);

  const finish = (next: 'opening' | 'home') => {
    const ok = mutate((db) => {
      setBaseCurrency(db, currency);
      setSetting(db, 'owner_name', name.trim());
      setSetting(db, 'onboarded', '1');
      return true;
    });
    if (!ok) return;
    router.replace('/');
    if (next === 'opening') router.push('/opening');
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View>
        <Text className="text-2xl font-bold text-gray-900">Set up your books</Text>
        <Text className="mt-1 text-base text-gray-600">
          Double-entry ledger for personal finances. Everything stays on this device.
        </Text>
      </View>
      <Card>
        <View className="gap-4">
          <Input label="Whose books are these?" value={name} onChangeText={setName} placeholder="e.g. Jane Tan" />
          <Select
            label="Base (reporting) currency"
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
            value={currency}
            onChange={setCurrency}
            helperText="Reports are in this currency. Bank accounts can still be held in other currencies. This can't change after you record transactions."
          />
        </View>
      </Card>
      <Card>
        <Text className="text-base font-semibold text-gray-900">What's included</Text>
        <Text className="mt-1 text-sm leading-5 text-gray-600">
          A personal chart of accounts (bank, cards, loans, income and expense categories) you can edit, plus payments, receipts,
          transfers, journals, bank reconciliation, and Balance Sheet, P&L, Trial Balance and ledger reports.
        </Text>
      </Card>
      <Button size="lg" onPress={() => finish('opening')}>
        Continue to opening balances
      </Button>
      <Button variant="ghost" onPress={() => finish('home')}>
        Skip for now
      </Button>
    </ScrollView>
  );
}
