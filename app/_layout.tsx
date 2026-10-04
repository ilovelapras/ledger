import './global.css';
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { Providers } from '../components/Providers';
import { LockGate } from '../components/mm/LockGate';
import { today } from '../domain/dates';
import { postDueRecurrences } from '../db/recurrences';
import { DB_NAME, migrate } from '../db/schema';

export default function RootLayout() {
  return (
    <Providers>
      <SQLiteProvider
        databaseName={DB_NAME}
        onInit={async (db) => {
          migrate(db);
          // Record repeating transactions that fell due while the app was closed.
          postDueRecurrences(db, today());
        }}
      >
        <StatusBar style="dark" />
        <LockGate>
          <Stack
            screenOptions={{
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: '#f5f5f7' },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ title: 'Welcome', gestureEnabled: false, headerBackVisible: false }} />
            <Stack.Screen name="transaction/new" options={{ title: 'New', presentation: 'modal' }} />
            <Stack.Screen name="transaction/[id]" options={{ title: 'Transaction' }} />
            <Stack.Screen name="account/[id]" options={{ title: 'Account' }} />
            <Stack.Screen name="account/edit" options={{ title: 'Account', presentation: 'modal' }} />
            <Stack.Screen name="stats/[id]" options={{ title: 'Category' }} />
            <Stack.Screen name="settings/budgets" options={{ title: 'Budget setting' }} />
            <Stack.Screen name="settings/categories" options={{ title: 'Categories' }} />
            <Stack.Screen name="settings/repeat" options={{ title: 'Repeat setting' }} />
            <Stack.Screen name="settings/favorites" options={{ title: 'Favourites' }} />
            <Stack.Screen name="settings/passcode" options={{ title: 'Passcode' }} />
          </Stack>
        </LockGate>
      </SQLiteProvider>
    </Providers>
  );
}
