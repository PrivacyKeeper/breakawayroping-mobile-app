// src/screens/RodeoDetail/index.tsx
//
// One rodeo: where it is, what the ground is doing, and what this app's event
// pays. This is the screen the map, weather and pin components were built for.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ArenaMap } from '@/components/ArenaMap';
import { PinDrop } from '@/components/PinDrop';
import { WeatherWidget } from '@/components/WeatherWidget';
import { Card } from '@/components/ui/Card';
import { QueryBoundary } from '@/components/ui/QueryBoundary';
import { Screen } from '@/components/ui/Screen';
import { Stat } from '@/components/ui/Stat';
import { app as appMeta, colors } from '@/constants/theme';
import type { Coordinates, PlacedPin } from '@/lib/location';
import { getEventForRodeo, getRodeo } from '@/lib/queries';

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toLocaleString()}`;
}

export function RodeoDetailScreen({ rodeoId }: { rodeoId: string }) {
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
