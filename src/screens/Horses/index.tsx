// src/screens/Horses/index.tsx

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { QueryBoundary } from '@/components/ui/QueryBoundary';
import { Screen } from '@/components/ui/Screen';
import { colors } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { addHorse, getMyProfile, listMyHorses } from '@/lib/queries';

function AddHorseForm({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const [barnName, setBarnName] = useState('');
  const [registeredName, setRegisteredName] = useState('');
  const [breed, setBreed] = useState('');
  const [foaledYear, setFoaledYear] = useState('');
  const queryClient = useQueryClient();

  // A year is optional, but a year that is not a year is not. Sending "twelve"
  // to an int column is a 400 from PostgREST with a message no contestant
  // should ever have to read.
  const yearNumber = foaledYear.trim() ? Number(foaledYear.trim()) : undefined;
  const yearProblem =
    yearNumber !== undefined && (!Number.isInteger(yearNumber) || yearNumber < 1950 || yearNumber > 2100)
      ? 'Four digits, 1950 or later.'
      : undefined;

  const create = useMutation({
    mutationFn: () =>
      addHorse(profileId, {
        barnName,
        registeredName: registeredName || undefined,
        breed: breed || undefined,
        foaledYear: yearNumber,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horses', profileId] });
      onDone();
    },
  });

  const canSubmit = barnName.trim().length > 0 && !yearProblem && !create.isPending;

  return (
    <Card
      title="Add a horse"
      subtitle="The barn name is all that is required. Everything else can wait."
    >
      <View style={{ gap: 16 }}>
        <Field
          label="Barn name"
          value={barnName}
          onChangeText={setBarnName}
          autoCapitalize="words"
          placeholder="What you call him"
        />
        <Field
          label="Registered name"
          value={registeredName}
          onChangeText={setRegisteredName}
          autoCapitalize="words"
          hint="Optional — the name on the papers."
        />
        <Field label="Breed" value={breed} onChangeText={setBreed} autoCapitalize="words" />
        <Field
          label="Foaled"
          value={foaledYear}
          onChangeText={setFoaledYear}
          keyboardType="number-pad"
          error={yearProblem}
        />

        {create.error ? (
          <Text style={{ color: colors.danger, fontSize: 13 }}>
            {create.error instanceof Error ? create.error.message : 'Could not add that horse.'}
          </Text>
        ) : null}

        <Button
          label={create.isPending ? 'Adding…' : 'Add horse'}
          onPress={() => create.mutate()}
          disabled={!canSubmit}
        />
        <Button label="Cancel" variant="secondary" onPress={onDone} />
      </View>
    </Card>
  );
}

export function HorsesScreen() {
  const { user } = useSession();
  const [adding, setAdding] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });
  const profileId = profileQuery.data?.id;

  const horsesQuery = useQuery({
    queryKey: ['horses', profileId],
    queryFn: () => listMyHorses(profileId!),
    enabled: Boolean(profileId),
  });

  if (adding && profileId) {
    return (
      <Screen>
        <AddHorseForm profileId={profileId} onDone={() => setAdding(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <QueryBoundary
        isLoading={profileQuery.isLoading || horsesQuery.isLoading}
        error={profileQuery.error ?? horsesQuery.error}
        data={horsesQuery.data}
        onRetry={() => horsesQuery.refetch()}
        empty={
          <EmptyState
            title="No horses yet"
            body="Add a horse once and the record follows it — health, results, and its measured baseline — including if you sell or lease it."
            actionLabel="Add a horse"
            onAction={() => setAdding(true)}
          />
        }
      >
        {(horses) => (
          <View style={{ gap: 12 }}>
            {horses.map((horse) => (
              <Card
                key={horse.id}
                title={horse.barn_name}
                subtitle={
                  [
                    horse.registered_name,
                    horse.breed,
                    horse.foaled_year ? `foaled ${horse.foaled_year}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              />
            ))}
            <Button label="Add another horse" variant="secondary" onPress={() => setAdding(true)} />
          </View>
        )}
      </QueryBoundary>
    </Screen>
  );
}
