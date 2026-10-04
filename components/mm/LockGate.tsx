import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { getSetting } from '../../db/settings';
import { useDb, useSettings } from '../../hooks/useLedger';
import { MM } from './theme';

export const PIN_KEY = 'ledger_pin';

/** Covers the app with a PIN pad when the passcode is on: at launch and whenever it returns from the background. */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { passcodeEnabled } = useSettings();
  const db = useDb();
  const [locked, setLocked] = useState(passcodeEnabled);
  const enabledRef = useRef(passcodeEnabled);
  enabledRef.current = passcodeEnabled;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' && enabledRef.current) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  if (!locked || !passcodeEnabled) return <>{children}</>;
  return (
    <>
      {children}
      <View className="absolute inset-0">
        <LockScreen biometric={getSetting(db, 'biometric_enabled') === '1'} onUnlock={() => setLocked(false)} />
      </View>
    </>
  );
}

function LockScreen({ biometric, onUnlock }: { biometric: boolean; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const tryBiometric = useCallback(async () => {
    try {
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) return;
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Ledger', disableDeviceFallback: true });
      if (r.success) onUnlock();
    } catch {
      // Fall back to the PIN pad.
    }
  }, [onUnlock]);

  useEffect(() => {
    if (biometric) tryBiometric();
  }, [biometric, tryBiometric]);

  const press = (d: string) => {
    setError(false);
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      const saved = SecureStore.getItem(PIN_KEY);
      if (saved && saved === next) onUnlock();
      else {
        setError(true);
        setPin('');
      }
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Ionicons name="lock-closed" size={36} color={MM.accent} />
      <Text className="mt-3 text-lg font-semibold text-gray-900">Enter passcode</Text>
      <View className="mt-5 flex-row gap-4">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="h-3.5 w-3.5 rounded-full border" style={{ borderColor: error ? MM.expense : '#111827', backgroundColor: i < pin.length ? '#111827' : 'transparent' }} />
        ))}
      </View>
      <Text className="mt-3 h-5 text-sm" style={{ color: MM.expense }}>
        {error ? 'Wrong passcode' : ''}
      </Text>
      <PinPad onDigit={press} onDelete={() => setPin((p) => p.slice(0, -1))} extra={biometric ? { icon: 'finger-print', onPress: tryBiometric } : undefined} />
    </View>
  );
}

export function PinPad({
  onDigit,
  onDelete,
  extra,
}: {
  onDigit: (d: string) => void;
  onDelete: () => void;
  extra?: { icon: 'finger-print'; onPress: () => void };
}) {
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];
  const Key = ({ children, onPress, label }: { children: React.ReactNode; onPress?: () => void; label: string }) => (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityLabel={label} className="m-2 h-16 w-16 items-center justify-center rounded-full active:bg-gray-100">
      {children}
    </Pressable>
  );
  return (
    <View className="mt-4">
      {rows.map((r) => (
        <View key={r.join('')} className="flex-row">
          {r.map((d) => (
            <Key key={d} label={d} onPress={() => onDigit(d)}>
              <Text className="text-2xl text-gray-900">{d}</Text>
            </Key>
          ))}
        </View>
      ))}
      <View className="flex-row">
        <Key label="Biometrics" onPress={extra?.onPress}>
          {extra ? <Ionicons name={extra.icon} size={26} color="#111827" /> : null}
        </Key>
        <Key label="0" onPress={() => onDigit('0')}>
          <Text className="text-2xl text-gray-900">0</Text>
        </Key>
        <Key label="Delete" onPress={onDelete}>
          <Ionicons name="backspace-outline" size={24} color="#111827" />
        </Key>
      </View>
    </View>
  );
}
