// src/screens/Home/index.tsx
//
// What is actually happening, rather than three buttons.
//
// The question this screen answers is "what do I need to know right now",
// and at a rodeo that is a short list: where am I entered, what did I draw,
// has anything been posted. Everything else is a tab away.

import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Stat } from '@/components/ui/Stat';
import { app as appMeta, colors } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import {
  getMyProfile,
  listMyDraws,
  listMyEntries,
  listMyNotices,
  type MyEntry,
} from '@/lib/queries';

/** Soonest first, and only what has not happened yet. */
function nextEntry(entries: MyEntry[]): MyEntry | null {
  const live = entries
    .filter(
      (e) =>
        !['scratched', 'turned_out', 'no_show', 'cancelled'].includes(e.status) &&
        e.rodeos !== null &&
        !['settled', 'cancelled'].includes(e.rodeos.status),
    )
    .sort((a, b) => (a.rodeos?.start_date ?? '').localeCompare(b.rodeos?.start_date ?? ''));
  return live[0] ?? null;
}

export function HomeScreen() {
  const { user } = useSession();

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });
  const profileId = profileQuery.data?.id;

  const entriesQuery = useQuery({
    queryKey: ['entries', profileId],
    queryFn: () => listMyEntries(profileId!),
    enabled: Boolean(profileId),
  });

  const drawsQuery = useQuery({
    queryKey: ['draws', profileId],
    queryFn: () => listMyDraws(profileId!),
    enabled: Boolean(profileId),
  });

  const noticesQuery = useQuery({
    queryKey: ['notices', profileId],
    queryFn: () => listMyNotices(profileId!),
    enabled: Boolean(profileId),
  });

  const next = nextEntry(entriesQuery.data ?? []);
  const draw = (drawsQuery.data ?? [])[0];
  const latestNotice = (noticesQuery.data ?? [])[0];

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
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700', lineHeight: 36 }}>
          {profileQuery.data ? `Hey ${profileQuery.data.first_name}` : appMeta.tagline}
        </Text>
      </View>

      {next ? (
        <Card
          title={next.rodeos?.name ?? 'Next up'}
          subtitle={
            next.rodeos
              ? `${new Date(`${next.rodeos.start_date}T00:00:00`).toLocaleDateString()} · ${[next.rodeos.venue_city, next.rodeos.venue_state].filter(Boolean).join(', ')}`
              : undefined
          }
        >
          <View style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}>
            <Stat
              label="Draw"
              value={next.draw_position ? String(next.draw_position) : '—'}
              hint={next.draw_position ? undefined : 'Not posted'}
            />
            {next.performance_number ? (
              <Stat label="Perf" value={String(next.performance_number)} />
            ) : null}
            <Stat label="Fees" value={next.fees_paid ? 'Paid' : 'Due'} />
          </View>
          <Button
            label="Open the rodeo"
            variant="secondary"
            onPress={() => router.push(`/rodeo/${next.rodeo_id}`)}
          />
        </Card>
      ) : (
        <Card
          title="Nothing entered"
          subtitle="Find a rodeo and enter it — entries, the draw and the results all land back here."
        >
          <Button label="Browse events" onPress={() => router.push('/events')} />
        </Card>
      )}

      {draw?.animals ? (
        <Card
          title={`You drew ${draw.animals.name}`}
          subtitle={
            draw.is_redraw
              ? 'This is a re-draw and replaces what you were on before.'
              : draw.animals.brand_number
                ? `Brand ${draw.animals.brand_number}`
                : undefined
          }
        />
      ) : null}

      {latestNotice ? (
        <Card title={latestNotice.subject} subtitle={latestNotice.body}>
          <Button
            label="All notifications"
            variant="secondary"
            onPress={() => router.push('/notices')}
          />
        </Card>
      ) : null}

      <Card
        title="Film a run"
        subtitle="Record it, and the app measures the run against your own benchmark rather than against somebody else's idea of perfect."
      >
        <Button label="Open the analyser" onPress={() => router.push('/analyze')} />
        <Button
          label="What ends your run"
          variant="secondary"
          onPress={() => router.push('/rules')}
        />
      </Card>

      <Card
        title="Log a run"
        subtitle="Practice runs are kept separate from official results, permanently. Nothing you hand-time can reach a leaderboard."
      >
        <Button label="Log one" variant="secondary" onPress={() => router.push('/compete')} />
      </Card>
    </Screen>
  );
}
