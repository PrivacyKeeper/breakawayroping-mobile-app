// src/screens/Profile/index.tsx

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { QueryBoundary } from '@/components/ui/QueryBoundary';
import { Screen } from '@/components/ui/Screen';
import { colors } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { getMyProfile, updateMyProfile, type Profile } from '@/lib/queries';

export function ProfileScreen() {
  const { user, signOut, deleteAccount } = useSession();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });

  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [dirty, setDirty] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Seed the form once the profile arrives. Guarded on `dirty` so a background
  // refetch cannot overwrite something the user is halfway through typing —
  // which is the classic version of this bug and only shows up on a slow link.
  useEffect(() => {
    if (query.data && !dirty) {
      setDraft(query.data);
    }
  }, [query.data, dirty]);

  const save = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error('No profile loaded.');
      await updateMyProfile(query.data.id, {
        first_name: draft.first_name?.trim() || query.data.first_name,
        last_name: draft.last_name?.trim() || query.data.last_name,
        phone: draft.phone ?? null,
        city: draft.city ?? null,
        state_province: draft.state_province ?? null,
      });
    },
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  function edit<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  return (
    <Screen>
      <QueryBoundary
        isLoading={query.isLoading}
        error={query.error}
        data={query.data}
        onRetry={() => query.refetch()}
        isEmpty={(profile) => profile === null}
        empty={
          <Card
            title="Your profile is missing"
            subtitle="Your account exists but has no contestant record. That happens to accounts created before this was automatic. Signing out and back in repairs it."
          >
            <Button label="Sign out" variant="secondary" onPress={signOut} />
          </Card>
        }
      >
        {(profile) =>
          profile ? (
            <View style={{ gap: 24 }}>
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>
                  {profile.first_name} {profile.last_name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 14 }}>{profile.email ?? ''}</Text>
              </View>

              <Card
                title="Your details"
                subtitle="Producers see your name and the contact details you put here when you enter their rodeo."
              >
                <View style={{ gap: 16 }}>
                  <Field
                    label="First name"
                    value={draft.first_name ?? ''}
                    onChangeText={(v) => edit('first_name', v)}
                    autoCapitalize="words"
                  />
                  <Field
                    label="Last name"
                    value={draft.last_name ?? ''}
                    onChangeText={(v) => edit('last_name', v)}
                    autoCapitalize="words"
                  />
                  <Field
                    label="Phone"
                    value={draft.phone ?? ''}
                    onChangeText={(v) => edit('phone', v)}
                    keyboardType="phone-pad"
                    hint="How the secretary reaches you about the draw."
                  />
                  <Field
                    label="Town"
                    value={draft.city ?? ''}
                    onChangeText={(v) => edit('city', v)}
                    autoCapitalize="words"
                  />
                  <Field
                    label="State"
                    value={draft.state_province ?? ''}
                    onChangeText={(v) => edit('state_province', v)}
                    autoCapitalize="words"
                    hint="Shown on the scoreboard next to your name."
                  />

                  {save.error ? (
                    <Text style={{ color: colors.danger, fontSize: 13 }}>
                      {save.error instanceof Error ? save.error.message : 'Could not save.'}
                    </Text>
                  ) : null}

                  <Button
                    label={save.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
                    onPress={() => save.mutate()}
                    disabled={!dirty || save.isPending}
                  />
                </View>
              </Card>

              <Card
                title="Signing out"
                subtitle="Your runs and horses stay on your account. Signing out on a shared phone is the right thing to do."
              >
                <Button
                  label="Sign out"
                  variant="secondary"
                  onPress={() =>
                    Alert.alert('Sign out?', 'You will need your password to get back in.', [
                      { text: 'Stay signed in', style: 'cancel' },
                      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
                    ])
                  }
                />
              </Card>

              {/*
                Required to be reachable from inside the app by App Store
                Guideline 5.1.1(v) — an email to support does not satisfy it.
                Two taps and an explicit confirmation, because it cannot be
                undone.
              */}
              <Card
                title="Close your account"
                subtitle={
                  'This removes your name and contact details for good and signs you out permanently. ' +
                  'Runs you logged and analyses you ran go with it. ' +
                  'Placings and anything a producer paid you stay on their books — they have tax obligations for a year that has already closed, and those records will no longer carry your name.'
                }
              >
                {deleteError ? (
                  <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 19 }}>
                    {deleteError}
                  </Text>
                ) : null}
                <Button
                  label={deleting ? 'Closing…' : 'Close my account'}
                  variant="secondary"
                  disabled={deleting}
                  onPress={() =>
                    Alert.alert(
                      'Close your account?',
                      'This cannot be undone. Your details are removed and you will not be able to sign in again.',
                      [
                        { text: 'Keep my account', style: 'cancel' },
                        {
                          text: 'Close it',
                          style: 'destructive',
                          onPress: () => {
                            setDeleting(true);
                            setDeleteError(null);
                            void deleteAccount().then((result) => {
                              setDeleting(false);
                              // On success the auth listener routes away; only
                              // a failure needs saying out loud.
                              if (!result.ok) setDeleteError(result.message);
                            });
                          },
                        },
                      ],
                    )
                  }
                />
              </Card>
            </View>
          ) : null
        }
      </QueryBoundary>
    </Screen>
  );
}
