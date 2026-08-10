import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
export function HorsesScreen() {
  return (
    <Screen>
      <EmptyState
        title={"No horses yet"}
        body={"Add a horse once and the record follows it — health, results, and its measured baseline — including if you sell or lease it."}
        actionLabel={"Add a horse"}
      />
    </Screen>
  );
}
