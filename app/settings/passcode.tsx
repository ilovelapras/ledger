import React, { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { getSetting, setSetting } from '../../db/settings';
import { useDb, useMutation, useSettings } from '../../hooks/useLedger';
import { PinPad, PIN_KEY } from '../../components/mm/LockGate';
import { MM } from '../../components/mm/theme';

export default function PasscodeSettings() {
  const { passcodeEnabled } = useSettings();
  const db = useDb();
  const mutate = useMutation();
  const [step, setStep] = useState<'idle' | 'enter' | 'confirm'>('idle');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const biometric = getSetting(db, 'biometric_enabled') === '1';

  useEffect(() => {
    (async () => {
      try {
        setBiometricAvailable((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()));
      } catch {
        setBiometricAvailable(false);
      }
    })();
  }, []);

  const digit = (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length < 4) return;
    if (step === 'enter') {
      setFirst(next);
      setPin('');
      setStep('confirm');
    } else if (next === first) {
      SecureStore.setItem(PIN_KEY, next);
      mutate((d2) => setSetting(d2, 'passcode_enabled', '1'));
      setStep('idle');
      setPin('');
      Alert.alert('Passcode on', 'Ledger will ask for it when opened.');
    } else {
      Alert.alert('Passcodes did not match', 'Try again.');
      setStep('enter');
      setPin('');
    }
  };

  const toggle = (on: boolean) => {
    if (on) {
      setStep('enter');
      setPin('');
    } else {
      SecureStore.deleteItemAsync(PIN_KEY).catch(() => undefined);
      mutate((d) => {
        setSetting(d, 'passcode_enabled', '0');
        setSetting(d, 'biometric_enabled', '0');
      });
    }
  };

  if (step !== 'idle') {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-lg font-semibold text-gray-900">{step === 'enter' ? 'Choose a 4-digit passcode' : 'Enter it again'}</Text>
        <View className="mt-5 flex-row gap-4">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} className="h-3.5 w-3.5 rounded-full border border-gray-900" style={{ backgroundColor: i < pin.length ? '#111827' : 'transparent' }} />
          ))}
        </View>
        <PinPad onDigit={digit} onDelete={() => setPin((p) => p.slice(0, -1))} />
        <Text onPress={() => (setStep('idle'), setPin(''))} className="mt-4 text-base" style={{ color: MM.muted }}>
          Cancel
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: MM.bg }}>
      <View className="mt-4 bg-white">
        <View className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3">
          <Text className="text-[15px] text-gray-900">Passcode</Text>
          <Switch value={passcodeEnabled} onValueChange={toggle} />
        </View>
        {passcodeEnabled ? (
          <>
            <View className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3">
              <View>
                <Text className="text-[15px] text-gray-900">Face ID / fingerprint</Text>
                {!biometricAvailable ? <Text className="text-xs text-gray-500">Not available on this device or in Expo Go</Text> : null}
              </View>
              <Switch
                value={biometric}
                disabled={!biometricAvailable}
                onValueChange={(on) => mutate((d) => setSetting(d, 'biometric_enabled', on ? '1' : '0'))}
              />
            </View>
            <Text onPress={() => (setStep('enter'), setPin(''))} className="px-4 py-3 text-[15px]" style={{ color: MM.income }}>
              Change passcode
            </Text>
          </>
        ) : null}
      </View>
      <Text className="px-6 pt-3 text-xs text-gray-500">
        If you forget the passcode, delete and reinstall the app — which erases its data — so keep a backup.
      </Text>
    </View>
  );
}
