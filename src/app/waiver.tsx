import { useLocalSearchParams } from 'expo-router';

import { WaiverScreen } from '@/screens/Waiver';

export default function WaiverRoute() {
  const { rodeoId } = useLocalSearchParams<{ rodeoId: string }>();
  return <WaiverScreen rodeoId={rodeoId} />;
}
