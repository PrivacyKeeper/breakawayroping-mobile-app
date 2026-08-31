// src/components/ArenaMap/index.tsx
//
// A map of a rodeo grounds, and a deliberate answer to what happens without a
// Google Maps key: it shows the coordinates, the place name and a working
// directions link. That is not a broken state — it is most of what a person
// standing in a parking lot actually wanted, and it means the app is testable
// and shippable before the Maps billing account exists.
//
// Tapping the map places a pin, so this doubles as the graphical half of
// PinDrop when tiles are available.

import { useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { formatCoordinates, pinFromCoordinates, type Coordinates, type PlacedPin } from '@/lib/location';

type ArenaMapProps = {
  center: Coordinates | null;
  pin?: PlacedPin | null;
  /** Omit to make the map read-only. */
  onPinChange?: (pin: PlacedPin) => void;
  height?: number;
};

function mapsKeyConfigured(): boolean {
  const key =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY
      : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
  return typeof key === 'string' && key.length > 0;
}

/** Opens the platform's own maps app — needs no key and always works. */
function openDirections(coords: Coordinates, label?: string | null) {
  const query = `${coords.latitude},${coords.longitude}`;
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${query}${label ? `&q=${encodeURIComponent(label)}` : ''}`
      : `geo:${query}?q=${query}${label ? `(${encodeURIComponent(label)})` : ''}`;

  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => {});
  });
}

export function ArenaMap({ center, pin, onPinChange, height = 220 }: ArenaMapProps) {
  const [MapModule] = useState(() => {
    if (!mapsKeyConfigured()) return null;
    try {
      // Required lazily so a build with no Maps key never pulls the native
      // module in at import time.
      return require('react-native-maps');
    } catch {
      return null;
    }
  });

  const target = pin ?? center;

  if (!target) {
    return (
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.card,
          padding: spacing.cardPad,
        }}
      >
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          No location set for this rodeo yet.
        </Text>
      </View>
    );
  }

  // Key present and the native module resolved — draw the real thing.
  if (MapModule?.default) {
    const MapView = MapModule.default;
    const Marker = MapModule.Marker;

    return (
      <View style={{ borderRadius: radius.card, overflow: 'hidden', height }}>
        <MapView
          style={{ flex: 1 }}
          initialRegion={{
            latitude: target.latitude,
            longitude: target.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          onPress={
            onPinChange
              ? async (event: { nativeEvent: { coordinate: Coordinates } }) => {
                  onPinChange(await pinFromCoordinates(event.nativeEvent.coordinate));
                }
              : undefined
          }
        >
          {pin ? <Marker coordinate={{ latitude: pin.latitude, longitude: pin.longitude }} /> : null}
        </MapView>
      </View>
    );
  }

  // No key. Everything below still does the job.
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.cardPad,
        gap: 8,
      }}
    >
      {pin?.label ? (
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{pin.label}</Text>
      ) : null}

      <Text style={{ color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
        {formatCoordinates(target)}
      </Text>

      <Pressable onPress={() => openDirections(target, pin?.label)} hitSlop={8}>
        <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>
          Open in Maps
        </Text>
      </Pressable>
    </View>
  );
}
