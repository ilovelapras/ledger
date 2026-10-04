'use client';

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet } from 'react-native';
import { Input } from './Input';

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  searchable?: boolean;
  label?: string;
  error?: string;
  helperText?: string;
  className?: string;
  disabled?: boolean;
}

export function Select({ 
  options, 
  value, 
  onChange, 
  placeholder = 'Select...', 
  searchable = false,
  label,
  error,
  helperText,
  className: customClass,
  disabled,
}: SelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  
  const selectedOption = options.find(o => o.value === value);
  const filteredOptions = searchable && search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleSelect = (optionValue: string | number) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <View className={`w-full ${customClass || ''}`}>
      {label && <Text className="text-sm font-medium text-gray-700 mb-1">{label}</Text>}
      
      <TouchableOpacity
        onPress={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        className={`flex-row items-center justify-between bg-white border rounded-lg px-4 py-3 
          focus:ring-2 focus:ring-primary-500/20
          ${disabled ? 'bg-gray-100' : ''}
          ${error ? 'border-red-500' : 'border-gray-300'}`}
        style={styles.selectContainer}
      >
        <Text className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
          {selectedOption?.label ?? placeholder}
        </Text>
        <Text className={isOpen ? 'text-gray-400 rotate-180' : 'text-gray-400'}>▼</Text>
      </TouchableOpacity>

      {error && <Text className="text-sm text-red-500 mt-1">{error}</Text>}
      {helperText && !error && <Text className="text-sm text-gray-500 mt-1">{helperText}</Text>}

      <Modal visible={isOpen} animationType="slide" transparent={true} onRequestClose={() => setIsOpen(false)}>
        <TouchableOpacity onPress={() => setIsOpen(false)} activeOpacity={1} className="flex-1" />
        <View className="flex-1 justify-end">
          <View className="bg-white rounded-t-2xl shadow-lg max-h-[60%]">
            {searchable && (
              <View className="p-4 border-b border-gray-100 sticky top-0 bg-white">
                <Input
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search..."
                  leftIcon={<Text>🔍</Text>}
                  className="mb-0"
                />
              </View>
            )}
            <ScrollView className="max-h-96" contentContainerStyle={styles.optionsContainer}>
              {filteredOptions.map((option) => (
                <TouchableOpacity
                  key={String(option.value)}
                  onPress={() => handleSelect(option.value)}
                  className={`px-4 py-3 border-b border-gray-100 flex-row items-center justify-between 
                    ${option.value === value ? 'bg-primary-50' : ''}`}
                >
                  <Text className={option.value === value ? 'text-primary-600 font-medium' : 'text-gray-900'}>
                    {option.label}
                  </Text>
                  {option.value === value && <Text className="text-primary-600">✓</Text>}
                </TouchableOpacity>
              ))}
              {filteredOptions.length === 0 && (
                <Text className="px-4 py-8 text-center text-gray-500">No options found</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  selectContainer: {
    minHeight: 50,
  },
  optionsContainer: {
    paddingBottom: 20,
  },
});