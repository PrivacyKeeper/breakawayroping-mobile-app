// src/screens/ForgotPassword/index.tsx

import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Screen } from '@/components/ui/Screen';
import { colors } from '@/constants/theme';
import { useSession } from '@/lib/auth';

export function ForgotPasswordScreen() {
  const { sendPasswordReset } = useSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (busy || email.trim().length < 4) return;
    setBusy(true);
    setError(null);
    const result = await sendPasswordReset(email);
    setBusy(false);
    // Deliberately identical whether or not the address is on file. Telling a
    // caller "no account with that email" turns this screen into a way to find
    // out who has an account here, and the only person it helps is the one
    // asking about somebody else's address.
    if (result.ok) {
      setSent(true);
    } else {
      setError(result.message);
    }
  }

  if (sent) {
    return (
      <Screen>
        <Card
          title="Check your email"
          subtitle={`If there is an account for ${email.trim()}, a reset link is on the way. Open it on this phone and it will bring you back here.`}
        >
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>
          Reset your password
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
          Enter the email on your account and we will send a link.
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
          error={error ?? undefined}
        />
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Button label="Send the link" onPress={onSubmit} disabled={email.trim().length < 4} />
        )}
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
