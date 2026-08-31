import { useLocalSearchParams } from 'expo-router';

import { ResultsScreen } from '@/screens/Results';

export default function ResultsRoute() {
  const { rodeoId } = useLocalSearchParams<{ rodeoId: string }>();
  return <ResultsScreen rodeoId={rodeoId} />;
}
