// src/components/ui/Field/index.tsx
//
// A labelled text input. Exists mainly to keep the arena-specific input
// settings in one place: autocorrect and autocapitalise are off by default
// because the things people type into this app are surnames, horse names and
// association numbers, and iOS "helpfully" turning "Hooey" into "Hooray" or
// capitalising a password is a support ticket.

import { useState } from 'react';
import { Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { colors, radius } from '@/constants/theme';

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'words' | 'sentences';
  autoComplete?: 'email' | 'password' | 'new-password' | 'name' | 'off';
  /** Shown under the field in the danger colour. */
  error?: string;
  /** Shown under the field in the muted colour when there is no error. */
  hint?: string;
  editable?: boolean;
  multiline?: boolean;
};

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete = 'off',
  error,
  hint,
  editable = true,
  multiline = false,
}: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
        editable={editable}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          color: colors.text,
          backgroundColor: colors.surface,
          borderWidth: 1,
          // The error border outranks focus: a field that is both focused and
          // wrong should read as wrong.
          borderColor: error ? colors.danger : focused ? colors.accent : colors.border,
          borderRadius: radius.control,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 16,
          minHeight: multiline ? 96 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          opacity: editable ? 1 : 0.5,
        }}
      />
      {error ? (
        <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>
      ) : hint ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text>
      ) : null}
    </View>
  );
}
