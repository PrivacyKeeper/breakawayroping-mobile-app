// src/components/ui/QueryBoundary/index.tsx
//
// The three states every remote read has, in one place.
//
// The reason this exists rather than each screen writing its own: the
// distinction between "loaded and empty" and "failed to load" is the one an
// arena app gets wrong most often, and getting it wrong is not cosmetic.
// Rendering "No rodeos yet" over a dropped connection tells a contestant there
// is nothing to enter when in fact there is — so an error is always shown as
// an error, with the reason and a way to try again.

import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors } from '@/constants/theme';

type QueryBoundaryProps<T> = {
  isLoading: boolean;
  error: unknown;
  data: T | undefined;
  onRetry?: () => void;
  /** Rendered when the query succeeded and returned nothing. */
  empty?: ReactNode;
  /** Decides emptiness. Defaults to an empty array check. */
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
};

function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong loading this.';
}

export function QueryBoundary<T>({
  isLoading,
  error,
  data,
  onRetry,
  empty,
  isEmpty,
  children,
}: QueryBoundaryProps<T>) {
  if (isLoading) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ gap: 12, alignItems: 'flex-start' }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>
          That did not load
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
          {messageFor(error)}
        </Text>
        {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
      </View>
    );
  }

  if (data === undefined) return null;

  const emptyCheck = isEmpty ?? ((d: T) => Array.isArray(d) && d.length === 0);
  if (empty && emptyCheck(data)) {
    return <>{empty}</>;
  }

  return <>{children(data)}</>;
}
