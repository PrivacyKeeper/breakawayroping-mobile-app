// src/screens/Compete/index.tsx
//
// Practice runs. The one rule this screen exists to hold: a hand-timed run is
// never allowed to look like an official result. Every row written here is
// `source: 'self_reported'` and `is_verified: false`, the `public_career` view
// excludes self-reported rows outright, and the RLS policy refuses anything
// else from a contestant. Three separate places, because this is the claim the
// whole record layer's credibility rests on.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { QueryBoundary } from '@/components/ui/QueryBoundary';
import { Screen } from '@/components/ui/Screen';
import { Stat } from '@/components/ui/Stat';
import { app, colors } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import {
  getMyProfile,
  listMyEntries,
  listMyRuns,
  logPracticeRun,
  type CareerRun,
  type MyEntry,
} from '@/lib/queries';

/** Accepts "8.4" and "8". Rejects anything that is not a plausible run time. */
function parseTime(input: string): { seconds: number } | { problem: string } {
  const trimmed = input.trim();
  if (!trimmed) return { problem: 'Enter the time.' };
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds)) return { problem: 'Numbers only, like 8.4' };
  if (seconds <= 0) return { problem: 'A run takes longer than that.' };
  // Generous on purpose: a slow practice run at a clinic is real, and an
  // arbitrary tight cap would reject a legitimate entry.
  if (seconds > 600) return { problem: 'That is over ten minutes — check the number.' };
  return { seconds };
}

/**
 * Accepts "82" and "82.5". A marked score, not a time.
 *
 * Two judges mark the horse and the rider out of 25 each, so the ceiling is
 * 100 and a real one is somewhere in the seventies or eighties. Zero is
 * allowed on purpose: a buck-off is marked as no score, and a rider logging a
 * zero is recording something true about their week.
 */
function parseScore(input: string): { score: number } | { problem: string } {
  const trimmed = input.trim();
  if (!trimmed) return { problem: 'Enter the score.' };
  const score = Number(trimmed);
  if (!Number.isFinite(score)) return { problem: 'Numbers only, like 82' };
  if (score < 0) return { problem: 'A score cannot be negative.' };
  if (score > 100) return { problem: 'Two judges mark 25 each — 100 is the ceiling.' };
  return { score };
}

/**
 * How a run is written down here follows the event, not the app template.
 *
 * "either" is ranch rodeo, where the card mixes a judged bronc ride with timed
 * events, so the person logging it has to say which one this was.
 */
function LogRunForm({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [where, setWhere] = useState('');
  const [value, setValue] = useState('');
  const [runDate, setRunDate] = useState(today);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  // Only asked when the app covers both, and it starts on the judged one
  // because that is the event ranch rodeo people call a "ride".
  const [kind, setKind] = useState<'time' | 'score'>(
    app.resultKind === 'time' ? 'time' : 'score',
  );
  const queryClient = useQueryClient();

  const judged = app.resultKind === 'score' || (app.resultKind === 'either' && kind === 'score');

  const parsed = judged ? parseScore(value) : parseTime(value);
  const valueProblem = 'problem' in parsed ? parsed.problem : undefined;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(runDate);

  const create = useMutation({
    mutationFn: () =>
      logPracticeRun(profileId, {
        rodeoName: where,
        runDate,
        timeSeconds: 'seconds' in parsed ? parsed.seconds : null,
        score: 'score' in parsed ? parsed.score : null,
        note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', profileId] });
      onDone();
    },
  });

  return (
    <Card
      title="Log a run"
      subtitle="This is yours. It is marked self-reported and it can never reach a leaderboard or a payout."
    >
      <View style={{ gap: 16 }}>
        <Field
          label="Where"
          value={where}
          onChangeText={setWhere}
          autoCapitalize="words"
          placeholder="Home arena"
          hint="A practice pen counts. Leave it blank and it is filed as Practice."
        />
        {app.resultKind === 'either' ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Judged ride"
                variant={kind === 'score' ? 'primary' : 'secondary'}
                onPress={() => setKind('score')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Timed event"
                variant={kind === 'time' ? 'primary' : 'secondary'}
                onPress={() => setKind('time')}
              />
            </View>
          </View>
        ) : null}

        <Field
          label={judged ? 'Score (out of 100)' : 'Time (seconds)'}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder={judged ? '82' : '8.4'}
          hint={
            judged
              ? 'Two judges, 25 for the horse and 25 for the rider each. A buck-off is a zero.'
              : undefined
          }
          error={touched ? valueProblem : undefined}
        />
        <Field
          label="Date"
          value={runDate}
          onChangeText={setRunDate}
          placeholder="YYYY-MM-DD"
          error={touched && !dateOk ? 'Use YYYY-MM-DD.' : undefined}
        />
        <Field
          label="Note"
          value={note}
          onChangeText={setNote}
          multiline
          autoCapitalize="sentences"
          hint="What you were working on. Optional."
        />

        {create.error ? (
          <Text style={{ color: colors.danger, fontSize: 13 }}>
            {create.error instanceof Error ? create.error.message : 'Could not log that run.'}
          </Text>
        ) : null}

        <Button
          label={create.isPending ? 'Saving…' : 'Save run'}
          onPress={() => {
            setTouched(true);
            if (valueProblem || !dateOk) return;
            create.mutate();
          }}
          disabled={create.isPending}
        />
        <Button label="Cancel" variant="secondary" onPress={onDone} />
      </View>
    </Card>
  );
}


/**
 * What you are entered in, and where you are in the draw.
 *
 * Above the run log on purpose: the draw is the single most-wanted piece of
 * information in this sport, and today it is found by refreshing a Facebook
 * page at eleven at night.
 */
function EntryRow({ entry }: { entry: MyEntry }) {
  const rodeo = entry.rodeos;
  const when = rodeo ? new Date(`${rodeo.start_date}T00:00:00`).toLocaleDateString() : '';
  const place = rodeo ? [rodeo.venue_city, rodeo.venue_state].filter(Boolean).join(', ') : '';

  return (
    <Card
      title={rodeo?.name ?? 'Rodeo'}
      subtitle={[when, place].filter(Boolean).join(' · ') || undefined}
    >
      <View style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}>
        <Stat
          label="Draw"
          value={entry.draw_position ? String(entry.draw_position) : '—'}
          hint={entry.draw_position ? undefined : 'Not posted yet'}
        />
        {entry.performance_number ? (
          <Stat label="Perf" value={String(entry.performance_number)} />
        ) : null}
        <Stat
          label="Fees"
          value={entry.fees_paid ? 'Paid' : 'Due'}
          hint={entry.fees_paid ? undefined : 'With the secretary'}
        />
        <Stat label="Status" value={entry.status} />
      </View>
    </Card>
  );
}

/**
 * A run reads back in whatever it was measured in.
 *
 * The column is checked rather than the app's `resultKind`, because an official
 * row arrives from the platform and a mixed card can carry either — ranch
 * rodeo writes a judged bronc ride and a timed sorting run into the same list.
 */
function describeRun(run: CareerRun): string {
  if (run.final_score !== null) return `${Number(run.final_score).toFixed(0)} points`;
  if (run.final_time !== null) return `${Number(run.final_time).toFixed(2)}s`;
  return app.resultKind === 'score' ? 'No score' : 'No time';
}

function RunRow({ run }: { run: CareerRun }) {
  const official = run.source !== 'self_reported';
  return (
    <Card
      title={describeRun(run)}
      subtitle={`${run.rodeo_name} · ${new Date(`${run.run_date}T00:00:00`).toLocaleDateString()}`}
    >
      <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
        {run.place ? <Stat label="Place" value={String(run.place)} /> : null}
        {run.earnings_cents > 0 ? (
          <Stat label="Won" value={`$${(run.earnings_cents / 100).toFixed(2)}`} />
        ) : null}
        <Stat
          label="Record"
          value={official ? 'Official' : 'Practice'}
          hint={official ? undefined : 'Not on any leaderboard'}
        />
      </View>
    </Card>
  );
}

export function CompeteScreen() {
  const { user } = useSession();
  const [logging, setLogging] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });
  const profileId = profileQuery.data?.id;

  const runsQuery = useQuery({
    queryKey: ['runs', profileId],
    queryFn: () => listMyRuns(profileId!),
    enabled: Boolean(profileId),
  });

  const entriesQuery = useQuery({
    queryKey: ['entries', profileId],
    queryFn: () => listMyEntries(profileId!),
    enabled: Boolean(profileId),
  });

  // Only what is still ahead. A rodeo that has settled belongs in the run log
  // below, not in a list of things you are entered in.
  const liveEntries = (entriesQuery.data ?? []).filter(
    (e) =>
      !['scratched', 'turned_out', 'no_show', 'cancelled'].includes(e.status) &&
      e.rodeos !== null &&
      !['completed', 'results_official', 'settled', 'cancelled'].includes(e.rodeos.status),
  );

  if (logging && profileId) {
    return (
      <Screen>
        <LogRunForm profileId={profileId} onDone={() => setLogging(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      {liveEntries.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>
            You are entered
          </Text>
          {liveEntries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </View>
      ) : null}

      <QueryBoundary
        isLoading={profileQuery.isLoading || runsQuery.isLoading}
        error={profileQuery.error ?? runsQuery.error}
        data={runsQuery.data}
        onRetry={() => runsQuery.refetch()}
        empty={
          <EmptyState
            title="Nothing logged yet"
            body="Log a practice run and it stays yours — hand-timed runs are structurally separated from official results and cannot reach a leaderboard."
            actionLabel="Log a run"
            onAction={() => setLogging(true)}
          />
        }
      >
        {(runs) => (
          <View style={{ gap: 12 }}>
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
            <Button label="Log another run" variant="secondary" onPress={() => setLogging(true)} />
          </View>
        )}
      </QueryBoundary>
    </Screen>
  );
}
