import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CURRENCIES } from '../domain/money';
import { setBaseCurrency, setSetting } from '../db/settings';
import { useMutation, useSettings } from '../hooks/useLedger';
import { ChoiceSheet } from '../components/mm/Sheets';
import { MM } from '../components/mm/theme';

export default function Onboarding() {
  const settings = useSettings();
  const mutate = useMutation();
  const [currency, setCurrency] = useState(settings.baseCurrency);
  const [picking, setPicking] = useState(false);

  const finish = () => {
    const ok = mutate((db) => {
      setBaseCurrency(db, currency);
      setSetting(db, 'onboarded', '1');
      return true;
    });
    if (!ok) return;
    router.replace('/accounts');
  };

  const name = CURRENCIES.find((c) => c.code === currency)?.name ?? currency;
  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 24, gap: 20 }}>
      <View>
        <Text className="text-3xl font-bold text-gray-900">Ledger</Text>
        <Text className="mt-2 text-base leading-6 text-gray-600">
          Track income, expenses and transfers across cash, bank accounts and cards. Everything stays on this phone.
        </Text>
      </View>
      <View>
        <Text className="mb-2 text-sm font-medium text-gray-700">Main currency</Text>
        <Pressable onPress={() => setPicking(true)} className="flex-row items-center justify-between rounded-lg border border-gray-300 px-4 py-3">
          <Text className="text-base text-gray-900">{`${currency} — ${name}`}</Text>
          <Text className="text-sm" style={{ color: MM.accent }}>
            Change
          </Text>
        </Pressable>
        <Text className="mt-2 text-xs text-gray-500">
          Totals and charts use this currency. Accounts can be in other currencies too. It can't change after your first entry.
        </Text>
      </View>
      <View className="rounded-xl bg-gray-50 p-4">
        <Text className="text-sm font-semibold text-gray-900">Next</Text>
        <Text className="mt-1 text-sm leading-5 text-gray-600">
          You'll start with Cash, Bank Account and Card. Tap and hold one to enter its current balance, or tap + to add your own.
        </Text>
      </View>
      <Pressable onPress={finish} className="h-12 items-center justify-center rounded-lg" style={{ backgroundColor: MM.accent }}>
        <Text className="text-base font-semibold text-white">Start</Text>
      </Pressable>
      <ChoiceSheet
        visible={picking}
        title="Main currency"
        value={currency}
        options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
        onClose={() => setPicking(false)}
        onPick={(c) => {
          setCurrency(c);
          setPicking(false);
        }}
      />
    </ScrollView>
  );
}
