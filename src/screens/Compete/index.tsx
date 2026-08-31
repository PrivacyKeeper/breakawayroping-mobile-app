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
import { colors } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { getMyProfile, listMyRuns, logPracticeRun, type CareerRun } from '@/lib/queries';

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

function LogRunForm({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [where, setWhere] = useState('');
  const [time, setTime] = useState('');
  const [runDate, setRunDate] = useState(today);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const queryClient = useQueryClient();

  const parsed = parseTime(time);
  const timeProblem = 'problem' in parsed ? parsed.problem : undefined;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(runDate);

  const create = useMutation({
    mutationFn: () =>
      logPracticeRun(profileId, {
        rodeoName: where,
        runDate,
        timeSeconds: 'seconds' in parsed ? parsed.seconds : null,
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
        <Field
          label="Time (seconds)"
          value={time}
          onChangeText={setTime}
          keyboardType="decimal-pad"
          placeholder="8.4"
          error={touched ? timeProblem : undefined}
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
            if (timeProblem || !dateOk) return;
            create.mutate();
          }}
          disabled={create.isPending}
        />
        <Button label="Cancel" variant="secondary" onPress={onDone} />
      </View>
    </Card>
  );
}

function RunRow({ run }: { run: CareerRun }) {
  const official = run.source !== 'self_reported';
  return (
    <Card
      title={run.final_time !== null ? `${Number(run.final_time).toFixed(2)}s` : 'No time'}
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

  if (logging && profileId) {
    return (
      <Screen>
        <LogRunForm profileId={profileId} onDone={() => setLogging(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
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
