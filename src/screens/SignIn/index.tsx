// src/screens/SignIn/index.tsx

import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Screen } from '@/components/ui/Screen';
import { app as appMeta, colors } from '@/constants/theme';
import { useSession } from '@/lib/auth';

export function SignInScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().length > 3 && password.length > 0 && !busy;

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    // On success the auth listener swaps the route out from under this screen,
    // so there is deliberately no navigation call here — two things trying to
    // navigate at once is how you get a back stack with a login screen buried
    // in it.
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: colors.accent,
            fontSize: 13,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {appMeta.domain}
        </Text>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>Sign in</Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
          One account across every RodeoApps app. If you already rope somewhere else in the
          portfolio, use the same email and your record follows you.
        </Text>
      </View>

      <View style={{ gap: 16 }}>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          error={error ?? undefined}
        />
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Button label="Sign in" onPress={onSubmit} disabled={!canSubmit} />
        )}
      </View>

      <View style={{ gap: 12 }}>
        <Button
          label="Create an account"
          variant="secondary"
          onPress={() => router.push('/sign-up')}
        />
        <Button
          label="Forgot your password?"
          variant="secondary"
          onPress={() => router.push('/forgot-password')}
        />
      </View>
    </Screen>
  );
}
