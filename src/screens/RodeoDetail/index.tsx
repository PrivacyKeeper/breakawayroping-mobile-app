// src/screens/RodeoDetail/index.tsx
//
// One rodeo: where it is, what the ground is doing, and what this app's event
// pays. This is the screen the map, weather and pin components were built for.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { ArenaMap } from '@/components/ArenaMap';
import { Button } from '@/components/ui/Button';
import { PinDrop } from '@/components/PinDrop';
import { WeatherWidget } from '@/components/WeatherWidget';
import { Card } from '@/components/ui/Card';
import { QueryBoundary } from '@/components/ui/QueryBoundary';
import { Screen } from '@/components/ui/Screen';
import { Stat } from '@/components/ui/Stat';
import { app as appMeta, colors } from '@/constants/theme';
import type { Coordinates, PlacedPin } from '@/lib/location';
import { useSession } from '@/lib/auth';
import {
  enterRodeoEvent,
  findMyEntry,
  getEventForRodeo,
  getMyProfile,
  getRodeo,
  type RodeoEventRow,
  type RodeoSummary,
} from '@/lib/queries';

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toLocaleString()}`;
}


/**
 * The enter button, and every reason it might not be one.
 *
 * The eligibility rule itself lives in the `entries_self_insert` policy, not
 * here. What this does is explain the outcome: a contestant who cannot enter
 * online needs the producer's phone number, not a greyed-out button.
 */
function EntryCard({
  rodeo,
  event,
  profileId,
}: {
  rodeo: RodeoSummary;
  event: RodeoEventRow;
  profileId: string | undefined;
}) {
  const queryClient = useQueryClient();

  const entryQuery = useQuery({
    queryKey: ['my-entry', profileId, event.id],
    queryFn: () => findMyEntry(profileId!, event.id),
    enabled: Boolean(profileId),
  });

  const enter = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error('Sign in to enter.');
      const result = await enterRodeoEvent(profileId, {
        orgId: rodeo.org_id,
        rodeoId: rodeo.id,
        rodeoEventId: event.id,
        entryFee: event.entry_fee,
      });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-entry', profileId, event.id] });
      queryClient.invalidateQueries({ queryKey: ['entries', profileId] });
    },
  });

  const existing = entryQuery.data;

  if (existing) {
    return (
      <Card
        title="You are entered"
        subtitle={
          existing.draw_position
            ? `You are ${existing.draw_position} in the draw.`
            : 'The draw is not posted yet. You will see your position here as soon as it is.'
        }
      >
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {existing.status === 'pending'
            ? 'Entry taken, fees still to settle with the secretary.'
            : `Status: ${existing.status}.`}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          Need to turn out? Ring the secretary — turnouts have notice rules and a
          deadline, and doing it through a person is what keeps you off a fine.
        </Text>
        {rodeo.contact_phone ? (
          <Button
            label={`Call ${rodeo.contact_name ?? 'the secretary'}`}
            variant="secondary"
            onPress={() => Linking.openURL(`tel:${rodeo.contact_phone}`)}
          />
        ) : null}
      </Card>
    );
  }

  const canEnterOnline = rodeo.status === 'entries_open' && rodeo.allow_online_entry;

  if (!canEnterOnline) {
    return (
      <Card
        title={rodeo.status === 'entries_open' ? 'Entries are by phone' : 'Entries are not open'}
        subtitle={
          rodeo.status === 'entries_open'
            ? 'This producer is not taking entries in the app. The number below reaches whoever is running the books.'
            : 'Nothing to enter yet. This page will let you in the moment the producer opens the books.'
        }
      >
        {rodeo.contact_phone ? (
          <Button
            label="Call the secretary"
            variant="secondary"
            onPress={() => Linking.openURL(`tel:${rodeo.contact_phone}`)}
          />
        ) : null}
      </Card>
    );
  }

  return (
    <Card
      title="Enter"
      subtitle={
        event.entry_fee
          ? `${money(event.entry_fee)} entry fee, settled with the secretary — nothing is charged here.`
          : 'Nothing is charged here; fees are settled with the secretary.'
      }
    >
      {enter.error ? (
        <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 19 }}>
          {enter.error instanceof Error ? enter.error.message : 'Could not enter.'}
        </Text>
      ) : null}
      <Button
        label={enter.isPending ? 'Entering…' : `Enter the ${appMeta.eventLabel.toLowerCase()}`}
        onPress={() => enter.mutate()}
        disabled={enter.isPending || !profileId}
      />
    </Card>
  );
}

export function RodeoDetailScreen({ rodeoId }: { rodeoId: string }) {
  const { user } = useSession();
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });
  // Where the contestant parked, not where the arena is. Kept on the device:
  // nobody else needs to know where somebody's trailer is, and there is no
  // column for it. It survives for the session, which is the trip that matters.
  const [trailerPin, setTrailerPin] = useState<PlacedPin | null>(null);

  const rodeoQuery = useQuery({
    queryKey: ['rodeo', rodeoId],
    queryFn: () => getRodeo(rodeoId),
  });

  const eventQuery = useQuery({
    queryKey: ['rodeo', rodeoId, 'event', appMeta.eventType],
    queryFn: () => getEventForRodeo(rodeoId),
    // Nothing to ask about until we know the rodeo exists.
    enabled: Boolean(rodeoQuery.data),
  });

  return (
    <Screen>
      <QueryBoundary
        isLoading={rodeoQuery.isLoading}
        error={rodeoQuery.error}
        data={rodeoQuery.data}
        onRetry={() => rodeoQuery.refetch()}
      >
        {(rodeo) => {
          const arena: Coordinates | null =
            rodeo.venue_lat !== null && rodeo.venue_lng !== null
              ? { latitude: Number(rodeo.venue_lat), longitude: Number(rodeo.venue_lng) }
              : null;

          return (
            <View style={{ gap: 24 }}>
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>
                  {rodeo.name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 14 }}>
                  {[rodeo.venue_name, rodeo.venue_city, rodeo.venue_state]
                    .filter(Boolean)
                    .join(' · ') || 'Venue to be announced'}
                </Text>
              </View>

              {/* Renders nothing at all without a weather key, by design. */}
              <WeatherWidget coords={arena} />

              {arena ? (
                <Card
                  title="Getting there"
                  subtitle="Tap for directions in your own maps app — that part needs no API key and works offline once loaded."
                >
                  <ArenaMap center={arena} pin={trailerPin} height={200} />
                </Card>
              ) : (
                <Card
                  title="No coordinates yet"
                  subtitle="The producer has not put this venue on the map. The address above is what they published."
                />
              )}

              <Card
                title="Mark your trailer"
                subtitle="Drop a pin where you parked. It stays on this phone — it is not sent anywhere and nobody else can see it."
              >
                <PinDrop value={trailerPin} onChange={setTrailerPin} label="your trailer" />
              </Card>

              <QueryBoundary
                isLoading={eventQuery.isLoading}
                error={eventQuery.error}
                data={eventQuery.data}
                onRetry={() => eventQuery.refetch()}
                isEmpty={(event) => event === null}
                empty={
                  <Card
                    title={`No ${appMeta.eventLabel.toLowerCase()} here`}
                    subtitle="This producer is not running your event at this rodeo. Everything else on this page still applies if you are hauling somebody."
                  />
                }
              >
                {(event) =>
                  event ? (
                    <View style={{ gap: 24 }}>
                    <Card title={appMeta.eventLabel}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
                        <Stat label="Entry fee" value={money(event.entry_fee)} />
                        <Stat label="Added" value={money(event.added_money)} />
                        <Stat label="Go-rounds" value={String(event.num_go_rounds ?? 1)} />
                        {event.score_line_feet ? (
                          <Stat
                            label="Score line"
                            value={`${event.score_line_feet} ft`}
                            hint="Barrier length"
                          />
                        ) : null}
                      </View>
                      {event.ground_rules ? (
                        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
                          {event.ground_rules}
                        </Text>
                      ) : null}
                    </Card>

                    <EntryCard rodeo={rodeo} event={event} profileId={profileQuery.data?.id} />

                    <Card
                      title="Paperwork"
                      subtitle="A producer cannot run you without a signed release. Sign it here and it goes on file with them."
                    >
                      <Button
                        label="Releases"
                        variant="secondary"
                        onPress={() => router.push(`/waiver?rodeoId=${rodeo.id}`)}
                      />
                    </Card>

                    {/* Results only exist once the rodeo is under way, and a
                        link to an empty page reads as a broken feature. */}
                    {['in_progress', 'completed', 'results_official', 'settled'].includes(
                      rodeo.status,
                    ) ? (
                      <Card title="Results" subtitle="Official placings as the secretary finalises them.">
                        <Button
                          label="See the results"
                          onPress={() => router.push(`/results?rodeoId=${rodeo.id}`)}
                        />
                      </Card>
                    ) : null}
                    </View>
                  ) : null
                }
              </QueryBoundary>
            </View>
          );
        }}
      </QueryBoundary>
    </Screen>
  );
}
