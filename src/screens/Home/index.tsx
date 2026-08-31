import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { app as appMeta, colors } from '@/constants/theme';
export function HomeScreen() {
  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.accent, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          {appMeta.domain}
        </Text>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700', lineHeight: 36 }}>
          {appMeta.tagline}
        </Text>
      </View>
        <Card
          title="Film a run"
          subtitle="Record it, and the app measures the run against your own benchmark rather than against somebody else's idea of perfect."
        >
          <Button label="Open the analyser" onPress={() => router.push('/analyze')} />
        </Card>
      <Card
        title="Log a run"
        subtitle="Practice runs are kept separate from official results, permanently. Nothing you hand-time can reach a leaderboard."
      >
        <Button label="Log one" variant="secondary" onPress={() => router.push('/compete')} />
      </Card>
      <Card
        title="Find a rodeo"
        subtitle="Entries, draw and results, straight from the producer running it."
      >
        <Button label="Browse events" variant="secondary" onPress={() => router.push('/events')} />
      </Card>
    </Screen>
  );
}
