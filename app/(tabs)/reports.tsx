import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AccountPicker } from '../../components/AccountPicker';
import { ListRow, SectionTitle } from '../../components/ui';

const REPORTS = [
  { type: 'balance-sheet', title: 'Balance Sheet', subtitle: 'Assets, liabilities and equity at a date' },
  { type: 'profit-loss', title: 'Profit & Loss', subtitle: 'Income and expenses for a period, with comparison' },
  { type: 'trial-balance', title: 'Trial Balance', subtitle: 'Debit and credit balance of every account' },
  { type: 'journal', title: 'Journal (Day Book)', subtitle: 'Every posted line in date order' },
] as const;

export default function Reports() {
  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ paddingBottom: 32 }}>
      <SectionTitle>Financial statements</SectionTitle>
      <View className="mx-4 overflow-hidden rounded-xl border border-gray-200">
        {REPORTS.map((r) => (
          <ListRow
            key={r.type}
            title={r.title}
            subtitle={r.subtitle}
            onPress={() => router.push(`/report/${r.type}`)}
            right={<Text className="text-gray-400">›</Text>}
          />
        ))}
      </View>
      <SectionTitle>General ledger</SectionTitle>
      <View className="mx-4 rounded-xl border border-gray-200 bg-white p-4">
        <Text className="mb-2 text-sm text-gray-600">Open the ledger for an account, with running balance and opening balance brought forward.</Text>
        <AccountPicker value={null} onChange={(id) => router.push(`/account/${id}`)} placeholder="Choose account" />
      </View>
    </ScrollView>
  );
}
