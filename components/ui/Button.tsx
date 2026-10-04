import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type PressableProps } from 'react-native';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

// Text colour must be set on <Text>; React Native does not inherit it from the pressable.
const container: Record<Variant, string> = {
  primary: 'bg-primary-600 active:bg-primary-700',
  secondary: 'bg-gray-100 active:bg-gray-200',
  outline: 'border border-gray-300 bg-white active:bg-gray-50',
  ghost: 'active:bg-gray-100',
  danger: 'bg-red-600 active:bg-red-700',
};

const label: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-gray-900',
  outline: 'text-gray-900',
  ghost: 'text-primary-700',
  danger: 'text-white',
};

const sizes = {
  sm: { box: 'px-3 py-1.5 rounded-md', text: 'text-sm' },
  md: { box: 'px-4 py-2.5 rounded-lg', text: 'text-base' },
  lg: { box: 'px-5 py-3.5 rounded-xl', text: 'text-lg' },
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      className={`flex-row items-center justify-center ${container[variant]} ${sizes[size].box} ${
        isDisabled ? 'opacity-40' : ''
      } ${className ?? ''}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : '#111'} />
      ) : (
        <View className="flex-row items-center gap-1.5">
          {icon}
          {typeof children === 'string' ? (
            <Text className={`font-semibold ${label[variant]} ${sizes[size].text}`}>{children}</Text>
          ) : (
            children
          )}
        </View>
      )}
    </Pressable>
  );
}
