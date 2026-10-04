'use client';

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onPress?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, className: customClass, onPress, padding = 'md' }: CardProps) {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const baseStyles = 'bg-white rounded-xl shadow-sm border border-gray-100';
  const pressStyles = onPress ? 'active:bg-gray-50' : '';

  const Component = onPress ? TouchableOpacity : View;

  return (
    <Component
      className={`${baseStyles} ${paddings[padding]} ${pressStyles} ${customClass || ''}`}
      onPress={onPress}
      accessible={!!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ children, className: customClass }: { children: React.ReactNode; className?: string }) {
  return (
    <View className={`mb-3 ${customClass || ''}`}>
      {children}
    </View>
  );
}

export function CardTitle({ children, className: customClass }: { children: React.ReactNode; className?: string }) {
  return (
    <Text className={`text-lg font-semibold text-gray-900 ${customClass || ''}`}>
      {children}
    </Text>
  );
}

export function CardDescription({ children, className: customClass }: { children: React.ReactNode; className?: string }) {
  return (
    <Text className={`text-sm text-gray-500 mt-1 ${customClass || ''}`}>
      {children}
    </Text>
  );
}

export function CardContent({ children, className: customClass }: { children: React.ReactNode; className?: string }) {
  return (
    <View className={customClass || ''}>
      {children}
    </View>
  );
}

export function CardFooter({ children, className: customClass }: { children: React.ReactNode; className?: string }) {
  return (
    <View className={`mt-4 pt-4 border-t border-gray-100 flex-row items-center justify-end gap-2 ${customClass || ''}`}>
      {children}
    </View>
  );
}