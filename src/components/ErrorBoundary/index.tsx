// src/components/ErrorBoundary/index.tsx
//
// What the app does when a screen throws.
//
// Without this, an uncaught render error unmounts the whole tree and the
// person is looking at a white rectangle with no way back. That is a review
// rejection on its own, and it is also the single worst thing that can happen
// in an arena — the app "broke" and the contestant has no idea whether their
// entry went through.
//
// React has no hook form of this. componentDidCatch only exists on a class,
// which is why this one file is written that way.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radius, spacing } from '@/constants/theme';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Goes to the device log, and to a crash reporter when one is wired. Kept
    // as a console call rather than swallowed: a boundary that hides the stack
    // makes the bug behind it far harder to find than no boundary at all.
    console.error('[app] uncaught render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingHorizontal: spacing.screenX,
          paddingVertical: spacing.screenY,
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>
            Something went wrong
          </Text>
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
            This screen hit an error. Nothing you have entered is lost — entries, runs and
            analyses live on the server, not in the app.
          </Text>
        </View>

        {/* The message, not just a sorry. Somebody reporting this needs
            something to quote, and __DEV__ gets the stack as well. */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.control,
            maxHeight: 220,
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 14 }}>
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
              {error.message}
              {__DEV__ && error.stack ? `\n\n${error.stack}` : ''}
            </Text>
          </ScrollView>
        </View>

        <Button label="Try again" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
