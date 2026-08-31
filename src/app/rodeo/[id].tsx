import { useLocalSearchParams } from 'expo-router';

import { RodeoDetailScreen } from '@/screens/RodeoDetail';

export default function RodeoRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RodeoDetailScreen rodeoId={id} />;
}
