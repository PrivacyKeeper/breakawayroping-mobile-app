// src/components/ui/Card/index.tsx

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

type CardProps = {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
};

export function Card({ title, subtitle, children }: CardProps) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.cardPad,
        gap: 8,
      }}
    >
      {title ? (
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
      ) : null}
      {subtitle ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{subtitle}</Text>
      ) : null}
      {children}
    </View>
  );
}
