// src/screens/Waiver/index.tsx
//
// Signing the release.
//
// The producer cannot run you without one, and until migration 0027 the app
// could not even show you the text: `waiver_templates_read` was
// org-members-only, and a contestant is not a member of the producer's
// organisation. The one document in the whole schema whose legal weight rests
// entirely on the signer having read it was the one the signer could not open.
//
// Two things this screen does deliberately:
//
//   * The full text is rendered, scrollable, above the signature. Not a link,
//     not a summary. A release signed against a summary is worth less than no
//     release, because it looks like evidence.
//   * The signature is a TYPED NAME, and the hashes are computed server-side
//     from the stored template by `sign_waiver`. A hash this phone produced
//     would prove nothing about what was on the screen.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { QueryBoundary } from '@/components/ui/QueryBoundary';
import { Screen } from '@/components/ui/Screen';
import { colors, radius } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import {
  getMyProfile,
  getRodeo,
  listMySignedWaivers,
  listWaiversFor,
  signWaiver,
  type WaiverTemplate,
} from '@/lib/queries';

function WaiverCard({
  template,
  orgId,
  rodeoId,
  profileId,
  signedAt,
  expectedName,
}: {
  template: WaiverTemplate;
  orgId: string;
  rodeoId: string;
  profileId: string;
  signedAt: string | null;
  expectedName: string;
}) {
  const [typed, setTyped] = useState('');
  const [touched, setTouched] = useState(false);
  const queryClient = useQueryClient();

  const sign = useMutation({
    mutationFn: async () => {
      const result = await signWaiver(orgId, template.id, profileId, typed, rodeoId);
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signed-waivers', profileId] });
    },
  });

  if (signedAt) {
    return (
      <Card
        title={template.name}
        subtitle={`Signed ${new Date(signedAt).toLocaleDateString()}. Version ${template.version} is on file with this producer.`}
      />
    );
  }

  // Compared case- and space-insensitively. A signature is the act of typing
  // your own name, not a spelling test, and rejecting "casey  roper" for the
  // double space would be a bad reason to stop somebody competing.
  const normalise = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  const matches = normalise(typed) === normalise(expectedName);
  const problem = !typed.trim()
    ? 'Type your name to sign.'
    : matches
      ? undefined
      : `That does not match the name on your profile (${expectedName}).`;

  return (
    <Card
      title={template.name}
      subtitle="Read it, then type your name to sign. This is the release the producer holds for you."
    >
      <View
        style={{
          maxHeight: 260,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.control,
          backgroundColor: colors.surface,
        }}
      >
        <ScrollView contentContainerStyle={{ padding: 14 }}>
          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}>
            {template.body_text}
          </Text>
        </ScrollView>
      </View>

      <Field
        label="Type your full name"
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="words"
        placeholder={expectedName}
        error={touched ? problem : undefined}
      />

      {sign.error ? (
        <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 19 }}>
          {sign.error instanceof Error ? sign.error.message : 'Could not sign.'}
        </Text>
      ) : null}

      <Button
        label={sign.isPending ? 'Signing…' : 'Sign this release'}
        onPress={() => {
          setTouched(true);
          if (problem) return;
          sign.mutate();
        }}
        disabled={sign.isPending}
      />
    </Card>
  );
}

export function WaiverScreen({ rodeoId }: { rodeoId: string }) {
  const { user } = useSession();

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });
  const profile = profileQuery.data;

  const rodeoQuery = useQuery({
    queryKey: ['rodeo', rodeoId],
    queryFn: () => getRodeo(rodeoId),
  });

  const templatesQuery = useQuery({
    queryKey: ['waivers', rodeoQuery.data?.org_id],
    queryFn: () => listWaiversFor(rodeoQuery.data!.org_id),
    enabled: Boolean(rodeoQuery.data?.org_id),
  });

  const signedQuery = useQuery({
    queryKey: ['signed-waivers', profile?.id],
    queryFn: () => listMySignedWaivers(profile!.id),
    enabled: Boolean(profile?.id),
  });

  const signedByTemplate = new Map(
    (signedQuery.data ?? []).map((s) => [s.waiver_template_id, s.signed_at]),
  );

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>Releases</Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
          {rodeoQuery.data?.name ?? 'This rodeo'} requires these before you compete. Signing here
          puts them on file with the producer.
        </Text>
      </View>

      <QueryBoundary
        isLoading={rodeoQuery.isLoading || templatesQuery.isLoading || profileQuery.isLoading}
        error={rodeoQuery.error ?? templatesQuery.error ?? profileQuery.error}
        data={templatesQuery.data}
        onRetry={() => templatesQuery.refetch()}
        empty={
          <EmptyState
            title="Nothing to sign"
            body="This producer has not posted a release in the app. That does not mean there is not one — expect a clipboard at the gate."
          />
        }
      >
        {(templates) => (
          <View style={{ gap: 16 }}>
            {templates.map((template) => (
              <WaiverCard
                key={template.id}
                template={template}
                orgId={rodeoQuery.data!.org_id}
                rodeoId={rodeoId}
                profileId={profile?.id ?? ''}
                signedAt={signedByTemplate.get(template.id) ?? null}
                expectedName={
                  profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'your name'
                }
              />
            ))}
          </View>
        )}
      </QueryBoundary>
    </Screen>
  );
}
