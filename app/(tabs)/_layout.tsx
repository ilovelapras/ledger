import React from 'react';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../../hooks/useLedger';
import { MM } from '../../components/mm/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName, focusedName: IconName) {
  return ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? focusedName : name} color={color} size={size} />
  );
}

export default function TabsLayout() {
  const settings = useSettings();
  if (!settings.onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: MM.accent,
        tabBarInactiveTintColor: '#9ca3af',
        headerTitleStyle: { color: '#111827' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Trans.', tabBarIcon: icon('book-outline', 'book') }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats', tabBarIcon: icon('pie-chart-outline', 'pie-chart') }} />
      <Tabs.Screen name="accounts" options={{ title: 'Accounts', tabBarIcon: icon('wallet-outline', 'wallet') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal-circle-outline', 'ellipsis-horizontal-circle') }} />
    </Tabs>
  );
}
