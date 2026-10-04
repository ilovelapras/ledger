import React from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  right?: React.ReactNode;
  containerClassName?: string;
  className?: string;
}

export function Input({ label, error, helperText, right, containerClassName, className, editable, ...props }: InputProps) {
  return (
    <View className={`w-full ${containerClassName ?? ''}`}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <View
        className={`flex-row items-center rounded-lg border bg-white ${
          error ? 'border-red-500' : 'border-gray-300'
        } ${editable === false ? 'bg-gray-100' : ''}`}
      >
        <TextInput
          placeholderTextColor="#9ca3af"
          editable={editable}
          {...props}
          className={`flex-1 px-3 py-2.5 text-base text-gray-900 ${className ?? ''}`}
        />
        {right ? <View className="pr-3">{right}</View> : null}
      </View>
      <FieldHint error={error} helperText={helperText} />
    </View>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text className="mb-1 text-sm font-medium text-gray-700">{children}</Text>;
}

export function FieldHint({ error, helperText }: { error?: string; helperText?: string }) {
  if (error) return <Text className="mt-1 text-sm text-red-600">{error}</Text>;
  if (helperText) return <Text className="mt-1 text-xs text-gray-500">{helperText}</Text>;
  return null;
}
