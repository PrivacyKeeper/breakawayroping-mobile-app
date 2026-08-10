import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
export function ProfileScreen() {
  return (
    <Screen>
      <EmptyState
        title={"Finish your profile"}
        body={"Add your association memberships so entry eligibility gets checked before you pay, not at the gate."}
        actionLabel={"Edit profile"}
      />
    </Screen>
  );
}
