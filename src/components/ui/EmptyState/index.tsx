// src/components/ui/EmptyState/index.tsx
//
// Empty states say what to do next rather than 'no data'. Most of these
// screens are empty for a new user, so this component carries a lot of the
// app's first impression.

import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors } from '@/constants/theme';

type EmptyStateProps = {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, body, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={{ gap: 12, alignItems: 'flex-start' }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>{body}</Text>
      {actionLabel ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}
