// src/screens/Analyze/index.tsx
//
// Film a run, get it back broken down.
//
// The video stays on the phone. Twelve keyframes go up, the model returns a
// structured result, and the fault codes it may use are a closed list supplied
// by the server — it selects, it does not invent. That constraint is what
// makes a coach able to count how many people on a roster share a fault, and
// it is the reason this is not just "ask a model about my run".

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryBoundary } from '@/components/ui/QueryBoundary';
import { Screen } from '@/components/ui/Screen';
import { Stat } from '@/components/ui/Stat';
import { app as appMeta, colors, primaryEvent, radius } from '@/constants/theme';
import {
  analyseRun,
  deleteAnalysis,
  listMyAnalyses,
  pickRunVideo,
  type AnalysisRow,
  type Progress,
  type RunAnalysis,
} from '@/lib/analysis';
import { useSession } from '@/lib/auth';
import { event as eventTaxonomy } from '@/lib/pose';
import { getMyProfile } from '@/lib/queries';

const SEVERITY_TONE = {
  low: colors.muted,
  medium: colors.warning,
  high: colors.danger,
} as const;

/**
 * Turn a server fault code into the label this app already uses for it.
 *
 * The server holds the enum and the app holds the wording, so the two lists
 * can drift. A code with no local definition is shown as the code rather than
 * hidden — a fault the roper cannot see is worse than an ugly one, and it is
 * also the only way anybody would notice the drift.
 */
function labelForFault(code: string): { label: string; drill?: string } {
  const found = eventTaxonomy.TAXONOMY.definitions.find((d) => d.code === code);
  return found ? { label: found.label, drill: found.drill } : { label: code };
}

function progressText(p: Progress): string {
  switch (p.step) {
    case 'picking':
      return 'Opening your videos…';
    case 'extracting':
      return `Reading frames ${p.done}/${p.total}…`;
    case 'uploading':
      return `Uploading frames ${p.done}/${p.total}…`;
    case 'analysing':
      return 'Watching the run…';
  }
}

function Pill({ label, tone }: { label: string; tone: string }) {
  return (
    <View
      style={{
        borderColor: tone,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color: tone, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function AnalysisDetail({ analysis }: { analysis: RunAnalysis }) {
  if (!analysis.is_expected_event) {
    return (
      <Card
        title="That does not look like a run"
        subtitle={analysis.summary}
      />
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Card title={`${Math.round(analysis.overall_score)} / 100`} subtitle={analysis.summary}>
        <Pill
          label={`${analysis.confidence} confidence`}
          tone={analysis.confidence === 'high' ? colors.success : colors.warning}
        />
      </Card>

      {analysis.phases.length > 0 ? (
        <Card title="By phase">
          <View style={{ gap: 14 }}>
            {analysis.phases.map((phase) => (
              <View key={phase.name} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                    {phase.name}
                  </Text>
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>
                    {Math.round(phase.score)}
                  </Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                  {phase.notes}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {analysis.faults.length > 0 ? (
        <Card
          title="What to fix"
          subtitle="Named from this event's fixed fault list, so the same mistake is called the same thing every time."
        >
          <View style={{ gap: 14 }}>
            {analysis.faults.map((fault, i) => {
              const { label, drill } = labelForFault(fault.code);
              return (
                <View key={`${fault.code}-${i}`} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                      {label}
                    </Text>
                    <Pill label={fault.severity} tone={SEVERITY_TONE[fault.severity]} />
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                    {fault.evidence}
                  </Text>
                  {drill ? (
                    <Text style={{ color: colors.accentAlt, fontSize: 13, lineHeight: 19 }}>
                      Drill: {drill}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {analysis.strengths.length > 0 ? (
        <Card title="What worked">
          <View style={{ gap: 6 }}>
            {analysis.strengths.map((s, i) => (
              <Text key={i} style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                • {s}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}

      {analysis.key_moments.length > 0 ? (
        <Card title="Moments">
          <View style={{ gap: 8 }}>
            {analysis.key_moments.map((moment, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                <Text
                  style={{
                    color: moment.type === 'good' ? colors.success : colors.warning,
                    fontSize: 13,
                    fontWeight: '700',
                    width: 46,
                  }}
                >
                  {moment.timestamp}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, flex: 1 }}>
                  {moment.description}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function HistoryRow({
  row,
  onOpen,
}: {
  row: AnalysisRow;
  onOpen: (analysis: RunAnalysis) => void;
}) {
  const when = new Date(row.created_at).toLocaleDateString();
  // Two clips analysed on the same day are otherwise indistinguishable in this
  // list, and in an app that covers both ends of a run the end is the point.
  const eventLabel =
    appMeta.events.length > 1
      ? (appMeta.events.find((e) => e.code === row.event_code)?.label ?? row.event_code)
      : null;

  if (row.status === 'failed') {
    return (
      <Card title="Analysis failed" subtitle={row.error_message ?? 'It did not complete.'}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{when}</Text>
      </Card>
    );
  }
  if (row.status === 'processing') {
    return <Card title="Still working…" subtitle={`Started ${when}`} />;
  }

  return (
    <Pressable
      onPress={() => row.analysis && onOpen(row.analysis)}
      style={({ pressed }) => ({
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: 16,
        gap: 8,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {eventLabel ? (
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>{eventLabel}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Stat label="Score" value={`${Math.round(row.overall_score ?? 0)}`} />
        <Stat label="Faults" value={String(row.fault_codes.length)} hint={when} />
      </View>
    </Pressable>
  );
}

export function AnalyzeScreen() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [current, setCurrent] = useState<RunAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which event the clip is of. Only asked when this app covers more than one,
  // which is every app here except tie-down.
  const [eventCode, setEventCode] = useState<string>(primaryEvent.code);

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });
  const profileId = profileQuery.data?.id;

  const historyQuery = useQuery({
    queryKey: ['analyses', profileId],
    queryFn: () => listMyAnalyses(profileId!),
    enabled: Boolean(profileId),
  });

  const run = useMutation({
    mutationFn: async () => {
      setError(null);
      setCurrent(null);
      setProgress({ step: 'picking' });

      const picked = await pickRunVideo();
      if (!picked) {
        setProgress(null);
        return null;
      }

      const result = await analyseRun(picked.uri, picked.durationMs, {
        eventCode,
        onProgress: setProgress,
      });
      setProgress(null);

      if (!result.ok) {
        setError(result.message);
        return null;
      }
      setCurrent(result.analysis);
      return result.analysis;
    },
    onSettled: () => {
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ['analyses', profileId] });
    },
    onError: (e) => {
      setProgress(null);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    },
  });

  const busy = run.isPending || progress !== null;

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>Run analysis</Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
          Pick a clip of one {appMeta.eventLabel.toLowerCase()} run. The video stays on your phone —
          only a dozen still frames are sent.
        </Text>
      </View>

      {busy ? (
        <Card title="Working" subtitle={progress ? progressText(progress) : 'Starting…'}>
          <ActivityIndicator color={colors.accent} />
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          {appMeta.events.length > 1 ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>
                What is this a run of?
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {appMeta.events.map((option) => (
                  <Button
                    key={option.code}
                    label={option.label}
                    variant={option.code === eventCode ? 'primary' : 'secondary'}
                    onPress={() => setEventCode(option.code)}
                  />
                ))}
              </View>
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                The analyser marks against a different list of faults for each one, so this has to
                be right.
              </Text>
            </View>
          ) : null}
          <Button label="Analyse a run" onPress={() => run.mutate()} />
        </View>
      )}

      {error ? (
        <Card title="That did not work" subtitle={error}>
          <Button label="Try again" variant="secondary" onPress={() => run.mutate()} />
        </Card>
      ) : null}

      {current ? <AnalysisDetail analysis={current} /> : null}

      {!current && !busy ? (
        <QueryBoundary
          isLoading={historyQuery.isLoading}
          error={historyQuery.error}
          data={historyQuery.data}
          onRetry={() => historyQuery.refetch()}
          empty={
            <EmptyState
              title="Nothing analysed yet"
              body="Film a run from the side, with the whole arena in shot, and the analyser will break it into phases and tell you which one cost you."
            />
          }
        >
          {(rows) => (
            <View style={{ gap: 12 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>
                Earlier runs
              </Text>
              {rows.map((row) => (
                <HistoryRow key={row.id} row={row} onOpen={setCurrent} />
              ))}
            </View>
          )}
        </QueryBoundary>
      ) : null}
    </Screen>
  );
}

export { deleteAnalysis };
