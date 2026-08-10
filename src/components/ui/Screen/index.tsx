// src/components/ui/Screen/index.tsx
//
// Every screen sits on this. Keeps the house padding rule in one place
// instead of copied into thirty files.

import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
};

export function Screen({ children, scroll = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const style = {
    flex: 1,
    backgroundColor: colors.background,
  } as const;
  const contentStyle = {
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.screenY,
    paddingBottom: spacing.screenY + insets.bottom,
    gap: spacing.gap,
  } as const;

  if (!scroll) {
    return <View style={[style, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView style={style} contentContainerStyle={contentStyle}>
      {children}
    </ScrollView>
  );
}
