import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router, useRootNavigationState, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/lib/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Arena connectivity is poor by default, not exceptionally. Serve
      // cached data rather than a spinner whenever we plausibly can.
      staleTime: 60_000,
      retry: 2,
    },
  },
});

/**
 * Sends a signed-out user to the sign-in screen and a signed-in one out of it.
 *
 * Three conditions have to hold before this may navigate, and each one is a
 * bug if you drop it:
 *
 *   `loading`   — the stored session is read asynchronously, so acting on the
 *                 first frame bounces a signed-in user to login on every cold
 *                 start.
 *   `navState`  — expo-router throws if you navigate before the root navigator
 *                 has mounted.
 *   the segment — redirecting to a route you are already on loops.
 */
function useAuthGate() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (loading || !navState?.key) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, loading, segments, navState?.key]);

  return loading;
}

function RootNavigator() {
  const loading = useAuthGate();

  // Held deliberately rather than rendering the tabs behind a redirect: a
  // half-second of the signed-in UI before being thrown to login looks like a
  // crash to the person holding the phone.
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="analyze" options={{ title: 'Run analysis' }} />
      <Stack.Screen name="rodeo/[id]" options={{ title: 'Rodeo' }} />
      <Stack.Screen name="results" options={{ title: 'Results' }} />
      <Stack.Screen name="waiver" options={{ title: 'Releases' }} />
      <Stack.Screen name="notices" options={{ title: 'Notifications' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </SafeAreaProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
