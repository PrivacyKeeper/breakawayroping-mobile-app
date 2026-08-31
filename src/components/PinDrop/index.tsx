// src/components/PinDrop/index.tsx
//
// Drop a pin on a rodeo grounds. Deliberately usable with no map and no
// network: the arena is often the place with the worst signal a roper will
// stand in all week, and a producer marking the back gate should not be
// blocked because tiles will not load.
//
// Two ways to place a pin, and the second is not a fallback — it is the one a
// producer standing at the gate actually wants:
//   1. Use my location  — the phone's fix
//   2. Enter coordinates — typed, or corrected off a bad fix

import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radius } from '@/constants/theme';
import {
  explainFailure,
  formatCoordinates,
  getCurrentPin,
  pinFromCoordinates,
  type PlacedPin,
} from '@/lib/location';

type PinDropProps = {
  /** An already-placed pin, when editing rather than placing. */
  value?: PlacedPin | null;
  onChange: (pin: PlacedPin | null) => void;
  /** What the pin marks — "the arena", "the back gate", "camping". */
  label?: string;
};

/** Accepts "31.9686, -99.9018" or "31.9686 -99.9018". Rejects out-of-range. */
function parseCoordinateInput(
  raw: string,
): { latitude: number; longitude: number } | null {
  const parts = raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length !== 2) return null;

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return { latitude, longitude };
}

export function PinDrop({ value, onChange, label = 'this spot' }: PinDropProps) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  const useMyLocation = useCallback(async () => {
    setBusy(true);
    setProblem(null);

    const result = await getCurrentPin();
    setBusy(false);

    if (!result.ok) {
      setProblem(explainFailure(result.reason));
      // Open the manual field straight away rather than leaving a dead end.
      setTyping(true);
      return;
    }

    onChange(result.value);
  }, [onChange]);

  const commitTyped = useCallback(async () => {
    const coords = parseCoordinateInput(draft);
    if (!coords) {
      setProblem('Enter it as latitude, longitude — for example 31.9686, -99.9018');
      return;
    }

    setBusy(true);
    setProblem(null);
    const pin = await pinFromCoordinates(coords);
    setBusy(false);
    setTyping(false);
    setDraft('');
    onChange(pin);
  }, [draft, onChange]);

  if (value) {
    return (
      <View style={{ gap: 10 }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.control,
            padding: 14,
            gap: 4,
          }}
        >
          {value.label ? (
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
              {value.label}
            </Text>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
            {formatCoordinates(value)}
          </Text>
          {value.accuracy != null ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Accurate to about {Math.round(value.accuracy)} m
            </Text>
          ) : null}
        </View>

        <Pressable onPress={() => onChange(null)} hitSlop={8}>
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>
            Move this pin
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {busy ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.muted, fontSize: 14 }}>Getting a fix…</Text>
        </View>
      ) : (
        <Button label={`Use my location for ${label}`} onPress={useMyLocation} />
      )}

      {problem ? (
        <Text style={{ color: colors.warning, fontSize: 13, lineHeight: 19 }}>{problem}</Text>
      ) : null}

      {typing ? (
        <View style={{ gap: 10 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="31.9686, -99.9018"
            placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: radius.control,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: colors.text,
              fontSize: 15,
              fontVariant: ['tabular-nums'],
            }}
          />
          <Button label="Drop the pin here" variant="secondary" onPress={commitTyped} />
        </View>
      ) : (
        <Pressable onPress={() => setTyping(true)} hitSlop={8}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            Or enter coordinates by hand
          </Text>
        </Pressable>
      )}
    </View>
  );
}
