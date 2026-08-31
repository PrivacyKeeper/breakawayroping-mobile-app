// src/lib/location.ts
//
// Location for the arena, not for a delivery app. Two things matter here:
// a rodeo grounds is usually a long way from anything with a street number,
// and phone signal there is poor. So every call returns a result rather than
// throwing, and nothing in the UI is allowed to block on a fix arriving.
//
// Reverse geocoding uses the OS geocoder, which costs nothing and needs no
// Google key — that is deliberate. The Maps key is only needed to draw a map,
// not to turn a pin into a place name.

import * as Location from 'expo-location';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type PlacedPin = Coordinates & {
  /** Metres of uncertainty reported by the OS, when it reports any. */
  accuracy: number | null;
  /** Best-effort human label. Null when the geocoder has nothing. */
  label: string | null;
  placedAt: string;
};

export type LocationFailure =
  | 'permission-denied'
  | 'services-disabled'
  | 'unavailable';

export type LocationResult =
  | { ok: true; value: PlacedPin }
  | { ok: false; reason: LocationFailure };

/**
 * Ask once, politely. Returns false rather than throwing so a screen can carry
 * on without a fix — an entry form still works if the roper types the town.
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

export async function hasLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Turn coordinates into something a person recognises. Falls back through
 * city → region → country, and returns null rather than an empty string so
 * callers can tell "no name" from "a name that happens to be blank".
 */
export async function describeCoordinates(
  coords: Coordinates,
): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync(coords);
    if (!place) return null;

    const town = place.city ?? place.subregion ?? place.district;
    const region = place.region;

    if (town && region) return `${town}, ${region}`;
    return town ?? region ?? place.country ?? null;
  } catch {
    // The OS geocoder is offline-dependent on Android. A missing name is not
    // an error worth surfacing — the pin itself is still good.
    return null;
  }
}

/**
 * Current position as a droppable pin. `Balanced` accuracy rather than
 * `Highest`: an arena pin does not need sub-metre precision and the high
 * accuracy mode is markedly worse on battery with a weak sky view.
 */
export async function getCurrentPin(): Promise<LocationResult> {
  const enabled = await Location.hasServicesEnabledAsync().catch(() => false);
  if (!enabled) return { ok: false, reason: 'services-disabled' };

  const granted = (await hasLocationPermission()) || (await requestLocationPermission());
  if (!granted) return { ok: false, reason: 'permission-denied' };

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const coords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    return {
      ok: true,
      value: {
        ...coords,
        accuracy: position.coords.accuracy ?? null,
        label: await describeCoordinates(coords),
        placedAt: new Date(position.timestamp).toISOString(),
      },
    };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * A pin the user placed by hand — tapping a map, or correcting a bad fix.
 * Named separately from `getCurrentPin` because the two mean different things
 * downstream: one is where the phone was, the other is where the person says
 * the gate is, and a producer needs the second.
 */
export async function pinFromCoordinates(coords: Coordinates): Promise<PlacedPin> {
  return {
    ...coords,
    accuracy: null,
    label: await describeCoordinates(coords),
    placedAt: new Date().toISOString(),
  };
}

const FAILURE_COPY: Record<LocationFailure, string> = {
  'permission-denied':
    'Location is off for this app. Turn it on in Settings, or drop the pin by hand.',
  'services-disabled':
    'Location services are switched off on this phone. Turn them on, or drop the pin by hand.',
  unavailable:
    "Couldn't get a fix — that happens in a metal barn. Drop the pin by hand instead.",
};

/** Every failure has a way forward. None of these is a dead end. */
export function explainFailure(reason: LocationFailure): string {
  return FAILURE_COPY[reason];
}

/** Decimal degrees, 5 dp — about a metre, and all a grounds pin ever needs. */
export function formatCoordinates(coords: Coordinates): string {
  const ns = coords.latitude >= 0 ? 'N' : 'S';
  const ew = coords.longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(coords.latitude).toFixed(5)}° ${ns}, ${Math.abs(coords.longitude).toFixed(5)}° ${ew}`;
}
