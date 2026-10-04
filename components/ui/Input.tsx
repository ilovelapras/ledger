'use client';

import React from 'react';
import { TextInput, Text, View, StyleSheet } from 'react-native';

interface InputProps extends React.ComponentPropsWithoutRef<typeof TextInput> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({ 
  label, 
  error, 
  helperText, 
  leftIcon, 
  rightIcon, 
  className: customClass,
  style,
  ...props 
}: InputProps) {
  const inputRef = React.useRef<TextInput>(null);
  
  return (
    <View className={`w-full ${customClass || ''}`}>
      {label && (
        <Text className="text-sm font-medium text-gray-700 mb-1">{label}</Text>
      )}
      <View className="relative">
        {leftIcon && (
          <View className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10">
            {leftIcon}
          </View>
        )}
        <TextInput
          ref={inputRef}
          {...props}
          style={[
            styles.input,
            leftIcon && styles.withLeftIcon,
            rightIcon && styles.withRightIcon,
            error && styles.error,
            style,
          ]}
          className={`bg-white border rounded-lg text-gray-900 placeholder-gray-400 
            focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
            disabled:bg-gray-100 disabled:text-gray-500
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}
            ${customClass || ''}`}
        />
        {rightIcon && (
          <View className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 z-10">
            {rightIcon}
          </View>
        )}
      </View>
      {error && <Text className="text-sm text-red-500 mt-1">{error}</Text>}
      {helperText && !error && <Text className="text-sm text-gray-500 mt-1">{helperText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  withLeftIcon: {
    paddingLeft: 40,
  },
  withRightIcon: {
    paddingRight: 40,
  },
  error: {},
});