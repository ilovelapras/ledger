'use client';

import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';

interface ButtonProps extends React.ComponentPropsWithoutRef<typeof TouchableOpacity> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  loading = false, 
  disabled, 
  children, 
  className: customClass,
  ...props 
}: ButtonProps) {
  const baseStyles = 'flex-row items-center justify-center rounded-lg font-medium transition-colors';
  
  const variants = {
    primary: 'bg-primary-500 text-white active:bg-primary-600 disabled:bg-primary-300',
    secondary: 'bg-gray-200 text-gray-900 active:bg-gray-300 disabled:bg-gray-100',
    outline: 'border-2 border-primary-500 text-primary-500 active:bg-primary-50 disabled:border-primary-300 disabled:text-primary-300',
    ghost: 'text-primary-500 active:bg-primary-50 disabled:text-primary-300',
    danger: 'bg-red-500 text-white active:bg-red-600 disabled:bg-red-300',
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <TouchableOpacity
      {...props}
      disabled={disabled || loading}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${customClass || ''}`}
    >
      {loading ? (
        <View className="flex-row items-center gap-2">
          <View
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            style={styles.spinner}
          />
          <Text>Loading...</Text>
        </View>
      ) : (
        <Text>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  spinner: {},
});