// src/screens/Events/index.tsx

import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryBoundary } from '@/components/ui/QueryBoundary';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { listUpcomingRodeos, type RodeoSummary } from '@/lib/queries';

/** "12–14 Sep 2026", or a single date when it is a one-day rodeo. */
function formatRange(start: string, end: string | null): string {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = end ? new Date(`${end}T00:00:00`) : null;
  const month = { month: 'short', day: 'numeric' } as const;
  const full = { month: 'short', day: 'numeric', year: 'numeric' } as const;

  if (!endDate || start === end) {
    return startDate.toLocaleDateString(undefined, full);
  }
  return `${startDate.toLocaleDateString(undefined, month)} – ${endDate.toLocaleDateString(undefined, full)}`;
}

function placeOf(rodeo: RodeoSummary): string {
  const parts = [rodeo.venue_city, rodeo.venue_state].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return rodeo.venue_name ?? 'Venue to be announced';
}

/**
 * Entry status, in the words a contestant uses.
 *
 * `entries_closed` and `in_progress` are deliberately distinct: the first
 * means you have missed it, the second means it is happening right now and the
 * draw is worth opening.
 */
function entryState(rodeo: RodeoSummary): { label: string; tone: string } {
  switch (rodeo.status) {
    case 'entries_open':
      return { label: 'Entries open', tone: colors.success };
    case 'entries_closed':
      return { label: 'Entries closed', tone: colors.muted };
    case 'in_progress':
      return { label: 'Running now', tone: colors.accent };
    default:
      return { label: 'Announced', tone: colors.muted };
  }
}

function RodeoRow({ rodeo }: { rodeo: RodeoSummary }) {
  const state = entryState(rodeo);
  return (
    <Pressable
      onPress={() => router.push(`/rodeo/${rodeo.id}`)}
      style={({ pressed }) => ({
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.cardPad,
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 }}>
          {rodeo.name}
        </Text>
        <Text style={{ color: state.tone, fontSize: 12, fontWeight: '600' }}>{state.label}</Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        {formatRange(rodeo.start_date, rodeo.end_date)} · {placeOf(rodeo)}
      </Text>
      {rodeo.total_added_money ? (
        <Text style={{ color: colors.accentAlt, fontSize: 13 }}>
          ${Number(rodeo.total_added_money).toLocaleString()} added
        </Text>
      ) : null}
    </Pressable>
  );
}

export function EventsScreen() {
  const query = useQuery({
    queryKey: ['rodeos', 'upcoming'],
    queryFn: listUpcomingRodeos,
  });

  return (
    <Screen>
      <QueryBoundary
        isLoading={query.isLoading}
        error={query.error}
        data={query.data}
        onRetry={() => query.refetch()}
        empty={
          <EmptyState
            title="No rodeos yet"
            body="Events show up here as producers open entries. Follow one and you will get the draw and the results as they post, without refreshing anything."
          />
        }
      >
        {(rodeos) => (
          <View style={{ gap: 12 }}>
            <Card
              title={`${rodeos.length} coming up`}
              subtitle="Tap one for the venue, the ground and what the producer is paying."
            />
            {rodeos.map((rodeo) => (
              <RodeoRow key={rodeo.id} rodeo={rodeo} />
            ))}
          </View>
        )}
      </QueryBoundary>
    </Screen>
  );
}
