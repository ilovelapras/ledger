import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { displayDate, fromISO, toISO } from '../../domain/dates';
import { FieldHint, FieldLabel } from './Input';

interface DateFieldProps {
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  label?: string;
  error?: string;
  inline?: boolean;
}

/** iOS: native compact date button. Android: tap to open the dialog picker. */
export function DateField({ value, onChange, label, error, inline }: DateFieldProps) {
  const [androidOpen, setAndroidOpen] = useState(false);
  const date = value ? fromISO(value) : new Date();

  const picker =
    Platform.OS === 'ios' ? (
      <DateTimePicker
        value={date}
        mode="date"
        display="compact"
        onChange={(_, d) => d && onChange(toISO(d))}
        style={{ alignSelf: 'flex-start' }}
      />
    ) : (
      <>
        <Pressable onPress={() => setAndroidOpen(true)} className="rounded-lg border border-gray-300 bg-white px-3 py-3">
          <Text className="text-base text-gray-900">{value ? displayDate(value) : 'Pick a date'}</Text>
        </Pressable>
        {androidOpen ? (
          <DateTimePicker
            value={date}
            mode="date"
            onChange={(_, d) => {
              setAndroidOpen(false);
              if (d) onChange(toISO(d));
            }}
          />
        ) : null}
      </>
    );

  if (inline) return picker;
  return (
    <View>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {picker}
      <FieldHint error={error} />
    </View>
  );
}
