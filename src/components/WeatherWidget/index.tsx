// src/components/WeatherWidget/index.tsx
//
// Renders nothing at all when no weather key is configured, or when the call
// failed. That is the point: an arena screen with a blank grey box where the
// weather should be is worse than one that simply does not mention weather.

import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import type { Coordinates } from '@/lib/location';
import {
  getArenaWeather,
  groundLikelyWet,
  heatAdvisory,
  weatherConfigured,
  type ArenaWeather,
} from '@/lib/weather';

type WeatherWidgetProps = {
  coords: Coordinates | null;
};

export function WeatherWidget({ coords }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<ArenaWeather | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!coords || !weatherConfigured()) {
      setWeather(null);
      return;
    }

    getArenaWeather(coords).then((result) => {
      if (!cancelled) setWeather(result);
    });

    return () => {
      cancelled = true;
    };
  }, [coords?.latitude, coords?.longitude]);

  if (!weather) return null;

  const wet = groundLikelyWet(weather);
  const heat = heatAdvisory(weather);

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.cardPad,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 30,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          }}
        >
          {weather.temperatureF}°
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14 }}>{weather.condition}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
        <Detail label="Feels like" value={`${weather.feelsLikeF}°`} />
        <Detail label="Wind" value={`${weather.windMph} mph`} />
        <Detail label="Humidity" value={`${weather.humidityPct}%`} />
      </View>

      {wet ? (
        <Text style={{ color: colors.warning, fontSize: 13, lineHeight: 19 }}>
          Rain around — the ground may be heavy. Worth asking about the drag.
        </Text>
      ) : null}

      {heat ? (
        <Text style={{ color: colors.warning, fontSize: 13, lineHeight: 19 }}>{heat}</Text>
      ) : null}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      <Text style={{ color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}
