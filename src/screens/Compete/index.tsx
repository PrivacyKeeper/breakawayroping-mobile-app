import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
export function CompeteScreen() {
  return (
    <Screen>
      <EmptyState
        title={"Nothing logged yet"}
        body={"Log a practice run and it stays yours — hand-timed runs are structurally separated from official results and cannot reach a leaderboard."}
        actionLabel={"Log a run"}
      />
    </Screen>
  );
}
