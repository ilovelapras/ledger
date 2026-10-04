import './global.css';
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { Providers } from '../components/Providers';
import { DB_NAME, migrate } from '../db/schema';

export default function RootLayout() {
  return (
    <Providers>
      <SQLiteProvider databaseName={DB_NAME} onInit={async (db) => migrate(db)}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: '#15803d',
            headerTitleStyle: { color: '#111827' },
            contentStyle: { backgroundColor: '#f9fafb' },
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ title: 'Welcome', gestureEnabled: false, headerBackVisible: false }} />
          <Stack.Screen name="transaction/new" options={{ title: 'New entry', presentation: 'modal' }} />
          <Stack.Screen name="transaction/[id]" options={{ title: 'Transaction' }} />
          <Stack.Screen name="transaction/edit/[id]" options={{ title: 'Edit transaction', presentation: 'modal' }} />
          <Stack.Screen name="account/[id]" options={{ title: 'Account' }} />
          <Stack.Screen name="account/edit" options={{ title: 'Account', presentation: 'modal' }} />
          <Stack.Screen name="account/reconcile/[id]" options={{ title: 'Reconcile' }} />
          <Stack.Screen name="report/[type]" options={{ title: 'Report' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="payees" options={{ title: 'Payees' }} />
          <Stack.Screen name="opening" options={{ title: 'Opening balances' }} />
        </Stack>
      </SQLiteProvider>
    </Providers>
  );
}
