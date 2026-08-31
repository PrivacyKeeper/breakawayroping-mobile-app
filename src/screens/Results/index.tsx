// src/screens/Results/index.tsx
//
// How it came out.
//
// Reads `public_results`, which is the single place a contestant's name
// crosses out of the private tables — name only, never contact details, date
// of birth, address or tax identifiers, and only for official placings at a
// rodeo already under way. Joining `results` to `users` directly would have
// been the mistake delta D31 caught once already, so this screen deliberately
// does not.

import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryBoundary } from '@/components/ui/QueryBoundary';
import { Screen } from '@/components/ui/Screen';
import { colors, radius } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { getMyProfile, listRodeoResults, type PublicResult } from '@/lib/queries';

function money(value: number | null): string {
  if (!value) return '';
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function Row({ result, isMe }: { result: PublicResult; isMe: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: radius.control,
        backgroundColor: isMe ? colors.card : 'transparent',
        borderWidth: isMe ? 1 : 0,
        borderColor: colors.accent,
      }}
    >
      <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700', width: 34 }}>
        {result.place ?? '—'}
        {/* A split is a fact about the placing, not a footnote. */}
        {result.tied_with && result.tied_with > 1 ? (
          <Text style={{ color: colors.muted, fontSize: 11 }}>{`/${result.tied_with}`}</Text>
        ) : null}
      </Text>
      <Text style={{ color: colors.text, fontSize: 15, flex: 1, fontWeight: isMe ? '700' : '400' }}>
        {result.first_name} {result.last_name}
      </Text>
      <View style={{ alignItems: 'flex-end' }}>
        {result.aggregate_score !== null ? (
          <Text style={{ color: colors.text, fontSize: 14 }}>
            {Number(result.aggregate_score).toFixed(2)}
          </Text>
        ) : null}
        {result.payout_amount ? (
          <Text style={{ color: colors.accentAlt, fontSize: 12 }}>
            {money(result.payout_amount)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function ResultsScreen({ rodeoId }: { rodeoId: string }) {
  const { user } = useSession();

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });

  const resultsQuery = useQuery({
    queryKey: ['results', rodeoId],
    queryFn: () => listRodeoResults(rodeoId),
    // Results land as the secretary finalises each round, so this is a screen
    // people watch rather than open once.
    refetchInterval: 30_000,
  });

  const rows = resultsQuery.data ?? [];
  // A rodeo runs go-rounds and then an average, and mixing them into one list
  // is how a contestant concludes they placed twice.
  const groups = new Map<string, PublicResult[]>();
  for (const r of rows) {
    const key =
      r.result_type === 'go_round' && r.go_round ? `Round ${r.go_round}` : titleFor(r.result_type);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>Results</Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
          {rows[0]?.rodeo_name ?? 'This rodeo'} — official placings only. This page refreshes
          itself as rounds are finalised.
        </Text>
      </View>

      <QueryBoundary
        isLoading={resultsQuery.isLoading}
        error={resultsQuery.error}
        data={rows}
        onRetry={() => resultsQuery.refetch()}
        empty={
          <EmptyState
            title="Nothing official yet"
            body="Placings appear as the secretary finalises each round. A time on the board is not a result until it is."
          />
        }
      >
        {() => (
          <View style={{ gap: 16 }}>
            {[...groups.entries()].map(([label, list]) => (
              <Card key={label} title={label}>
                <View style={{ gap: 2 }}>
                  {list.map((result, i) => (
                    <Row
                      key={`${result.contestant_id}-${result.result_type}-${result.go_round ?? i}`}
                      result={result}
                      isMe={result.contestant_id === profileQuery.data?.id}
                    />
                  ))}
                </View>
              </Card>
            ))}
          </View>
        )}
      </QueryBoundary>
    </Screen>
  );
}

function titleFor(resultType: string): string {
  switch (resultType) {
    case 'average':
      return 'Average';
    case 'aggregate':
      return 'Aggregate';
    case 'day_money':
      return 'Day money';
    case 'd_division':
      return 'Divisions';
    default:
      return 'Overall';
  }
}
