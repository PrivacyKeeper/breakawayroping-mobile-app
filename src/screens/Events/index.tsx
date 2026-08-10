import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
export function EventsScreen() {
  return (
    <Screen>
      <EmptyState
        title={"No rodeos yet"}
        body={"Events show up here as producers open entries. Follow one and you will get the draw and the results as they post, without refreshing anything."}
      />
    </Screen>
  );
}
