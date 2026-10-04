import React from 'react';
import { Text, View } from 'react-native';
import { presetRange, RANGE_PRESETS, type RangePreset } from '../domain/dates';
import { Chips, DateField } from './ui';

export interface DateRange {
  preset: RangePreset | 'custom';
  from: string;
  to: string;
}

export function rangeFromPreset(preset: RangePreset): DateRange {
  return { preset, ...presetRange(preset) };
}

export function DateRangeBar({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const options = [...RANGE_PRESETS.map((p) => ({ value: p.key as DateRange['preset'], label: p.label })), { value: 'custom' as const, label: 'Custom' }];
  return (
    <View className="border-b border-gray-200 bg-white py-2">
      <Chips
        options={options}
        value={value.preset}
        onChange={(p) => onChange(p === 'custom' ? { ...value, preset: 'custom' } : rangeFromPreset(p))}
      />
      {value.preset === 'custom' ? (
        <View className="mt-2 flex-row items-center gap-2 px-4">
          <DateField inline value={value.from} onChange={(from) => onChange({ ...value, from })} />
          <Text className="text-gray-500">to</Text>
          <DateField inline value={value.to} onChange={(to) => onChange({ ...value, to })} />
        </View>
      ) : null}
    </View>
  );
}
