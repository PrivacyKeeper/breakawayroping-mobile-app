// src/components/ui/Stat/index.tsx

import { Text, View } from 'react-native';

import { colors } from '@/constants/theme';

type StatProps = {
  label: string;
  value: string;
  hint?: string;
};

export function Stat({ label, value, hint }: StatProps) {
  return (
    <View style={{ gap: 2 }}>
      <Text
        style={{
          color: colors.muted,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>{value}</Text>
      {hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}
