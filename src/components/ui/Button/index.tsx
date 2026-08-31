// src/components/ui/Button/index.tsx

import { Pressable, Text } from 'react-native';

import { colors, radius } from '@/constants/theme';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', disabled }: ButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: isPrimary ? colors.accent : colors.surface,
        borderColor: isPrimary ? colors.accent : colors.border,
        borderWidth: 1,
        borderRadius: radius.control,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          color: isPrimary ? colors.background : colors.text,
          fontWeight: '600',
          fontSize: 15,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
