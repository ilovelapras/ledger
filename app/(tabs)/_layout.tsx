import React from 'react';
import { Pressable, type ColorValue } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useSettings } from '../../hooks/useLedger';

function icon(name: SymbolViewProps['name']) {
  return ({ color }: { color: ColorValue }) => <SymbolView name={name} tintColor={color} size={24} />;
}

function NewButton() {
  return (
    <Pressable onPress={() => router.push('/transaction/new')} hitSlop={12} className="px-4" accessibilityLabel="New entry">
      <SymbolView name="plus.circle.fill" tintColor="#15803d" size={26} />
    </Pressable>
  );
}

export default function TabsLayout() {
  const settings = useSettings();
  if (!settings.onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#15803d',
        headerTitleStyle: { color: '#111827' },
        headerRight: () => <NewButton />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Overview',
          tabBarIcon: icon('house'),
          headerLeft: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12} className="px-4" accessibilityLabel="Settings">
              <SymbolView name="gearshape" tintColor="#15803d" size={22} />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions', tabBarIcon: icon('list.bullet.rectangle') }} />
      <Tabs.Screen name="accounts" options={{ title: 'Accounts', tabBarIcon: icon('building.columns') }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: icon('chart.bar.doc.horizontal') }} />
    </Tabs>
  );
}
