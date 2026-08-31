// src/screens/SignUp/index.tsx

import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Screen } from '@/components/ui/Screen';
import { app as appMeta, colors } from '@/constants/theme';
import { useSession } from '@/lib/auth';

/** Deliberately loose. The authority on whether an address works is whether
 *  the confirmation email arrives; a clever regex only rejects real people. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export function SignUpScreen() {
  const { signUp } = useSession();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const problems = {
    firstName: firstName.trim() ? undefined : 'Required.',
    lastName: lastName.trim() ? undefined : 'Required.',
    email: EMAIL_PATTERN.test(email.trim()) ? undefined : 'That does not look like an email address.',
    password:
      password.length >= MIN_PASSWORD ? undefined : `At least ${MIN_PASSWORD} characters.`,
  };
  const valid = Object.values(problems).every((p) => p === undefined);

  // Errors only appear once somebody has tried, rather than shouting at an
  // empty form the moment it opens.
  const [touched, setTouched] = useState(false);
  const show = (key: keyof typeof problems) => (touched ? problems[key] : undefined);

  async function onSubmit() {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const result = await signUp(email, password, { firstName, lastName });
    setBusy(false);
    if (result.ok) {
      // Whether a session exists now depends on the project's email
      // confirmation setting, and this screen should not care. If confirmation
      // is off the auth listener routes away; if it is on, this message is the
      // right last word.
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
          subtitle={`If ${email.trim()} needs confirming, the link is on its way. Once it is confirmed you can sign in — and if you are already signed in, you are good to go.`}
        >
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </Card>
      </Screen>
    );
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
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>Create an account</Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
          Use the email a secretary would already have for you. If somebody has entered you at a
          rodeo, this picks up that record rather than starting a second one.
        </Text>
      </View>

      <View style={{ gap: 16 }}>
        <Field
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          autoComplete="name"
          error={show('firstName')}
        />
        <Field
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          autoComplete="name"
          error={show('lastName')}
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoComplete="email"
          error={show('email')}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          error={show('password')}
          hint={`At least ${MIN_PASSWORD} characters.`}
        />

        {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}

        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Button label="Create account" onPress={onSubmit} />
        )}
        <Button
          label="I already have an account"
          variant="secondary"
          onPress={() => router.replace('/sign-in')}
        />
      </View>
    </Screen>
  );
}
