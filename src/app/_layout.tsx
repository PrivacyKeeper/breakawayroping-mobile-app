import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, router, useRootNavigationState, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { colors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/lib/auth';

/**
 * Tell TanStack Query what "online" means on a phone.
 *
 * Without this it assumes the browser's navigator.onLine, which React Native
 * does not have — so it treats the app as permanently online and retries into
 * a void. NetInfo is the real answer, and it also means a query fired with no
 * signal resumes by itself the moment a bar appears rather than sitting failed
 * until somebody pulls to refresh.
 */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
  }),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Arena connectivity is poor by default, not exceptionally. Serve
      // cached data rather than a spinner whenever we plausibly can.
      staleTime: 60_000,
      retry: 2,
      // Kept for a day so the cache survives being restored from disk. Without
      // a gcTime at least as long as the persister's maxAge, a rehydrated
      // query is collected before it can be shown.
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
});

/**
 * The cache, written to disk.
 *
 * This is what makes the app usable standing in an arena with no signal: the
 * draw, the entry list and the rodeo you looked at ten minutes ago are all
 * still there. It is the difference between an app that is empty without a
 * connection and one that is merely out of date, and out of date is worth a
 * great deal more.
 */
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'rodeo-query-cache',
  // A write on every cache change would thrash the disk on a list screen.
  throttleTime: 2_000,
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
      <Stack.Screen name="rules" options={{ title: 'Rules' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24,
          dehydrateOptions: {
            // Only successful queries are worth restoring. Persisting an error
            // would show yesterday's failure as though it were today's.
            shouldDehydrateQuery: (query) => query.state.status === 'success',
          },
        }}
      >
        <SessionProvider>
          <SafeAreaProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </SafeAreaProvider>
        </SessionProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
