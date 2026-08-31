// src/screens/Notices/index.tsx
//
// Where "the draw is up" actually lands.
//
// `notices` is an outbox: a row is written in the same transaction as the
// thing it announces, and a worker delivers it later. That design is what
// stops a flaky arena hotspot losing a draw — but it also means the row exists
// whether or not the push notification was ever delivered.
//
// So this screen reads the table directly rather than relying on push. Push is
// exactly what fails at a rodeo: no signal, notifications off, a new phone. An
// in-app inbox is the copy that is always there.

import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { QueryBoundary } from '@/components/ui/QueryBoundary';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { getMyProfile, listMyNotices, type Notice } from '@/lib/queries';

/** The few that deserve to stand out from a list of the same-looking cards. */
const TONE: Record<string, string> = {
  draw_posted: colors.accent,
  results_posted: colors.success,
  payout_sent: colors.success,
  entry_deadline: colors.warning,
  performance_reminder: colors.warning,
};

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function NoticeRow({ notice }: { notice: Notice }) {
  const tone = TONE[notice.notice_type] ?? colors.border;
  const openable = Boolean(notice.rodeo_id);

  return (
    <Pressable
      disabled={!openable}
      onPress={() => notice.rodeo_id && router.push(`/rodeo/${notice.rodeo_id}`)}
      style={({ pressed }) => ({
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderLeftColor: tone,
        borderLeftWidth: 3,
        borderRadius: radius.card,
        padding: spacing.cardPad,
        gap: 4,
        opacity: pressed && openable ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>
          {notice.subject}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11 }}>{relative(notice.created_at)}</Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{notice.body}</Text>
    </Pressable>
  );
}

export function NoticesScreen() {
  const { user } = useSession();

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });
  const profileId = profileQuery.data?.id;

  const noticesQuery = useQuery({
    queryKey: ['notices', profileId],
    queryFn: () => listMyNotices(profileId!),
    enabled: Boolean(profileId),
    refetchInterval: 60_000,
  });

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>Notifications</Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
          Everything a producer has sent you. These are here whether or not the push arrived.
        </Text>
      </View>

      <QueryBoundary
        isLoading={profileQuery.isLoading || noticesQuery.isLoading}
        error={profileQuery.error ?? noticesQuery.error}
        data={noticesQuery.data}
        onRetry={() => noticesQuery.refetch()}
        empty={
          <EmptyState
            title="Nothing yet"
            body="When a producer posts a draw, opens entries or pays out, it shows up here — and stays, so you are not relying on a notification you might have missed."
          />
        }
      >
        {(notices) => (
          <View style={{ gap: 12 }}>
            {notices.map((notice) => (
              <NoticeRow key={notice.id} notice={notice} />
            ))}
          </View>
        )}
      </QueryBoundary>
    </Screen>
  );
}
