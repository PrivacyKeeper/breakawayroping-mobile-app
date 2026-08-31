// src/lib/weather.ts
//
// Weather for an arena, which is a narrower question than "what is the
// forecast". A roper wants three things: is the ground going to be wet, is it
// hot enough to matter for the horse, and is there wind. Everything else is
// noise on a phone screen at a rodeo.
//
// Provider-agnostic by design. `EXPO_PUBLIC_WEATHER_PROVIDER` picks the
// adapter and `EXPO_PUBLIC_WEATHER_API_KEY` authenticates it, so switching
// vendors is an env change, not a refactor. With no key configured every call
// returns `null` and the UI renders nothing — an absent widget is correct
// behaviour, not a broken one.

import type { Coordinates } from '@/lib/location';

export type ArenaWeather = {
  temperatureF: number;
  feelsLikeF: number;
  /** Short label: "Clear", "Light rain". */
  condition: string;
  windMph: number;
  humidityPct: number;
  /** Chance of precipitation over the next few hours, 0–1. Null if unknown. */
  precipitationChance: number | null;
  observedAt: string;
};

type Provider = 'openweather' | 'weatherapi' | 'tomorrow';

const PROVIDER = (process.env.EXPO_PUBLIC_WEATHER_PROVIDER ?? 'openweather') as Provider;
const API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

export function weatherConfigured(): boolean {
  return typeof API_KEY === 'string' && API_KEY.length > 0;
}

/** Callers should show ground-condition warnings off this, not off rain alone. */
export function groundLikelyWet(weather: ArenaWeather): boolean {
  return (weather.precipitationChance ?? 0) >= 0.4 || /rain|storm|shower|snow/i.test(weather.condition);
}

/** Heat that matters for a horse, not for a person. */
export function heatAdvisory(weather: ArenaWeather): string | null {
  const index = weather.feelsLikeF + weather.humidityPct;
  if (index >= 180) return 'Heat and humidity are high — watch your horse between runs.';
  if (weather.feelsLikeF >= 100) return 'Hot. Keep water in front of your horse.';
  return null;
}

async function fetchOpenWeather(coords: Coordinates): Promise<ArenaWeather | null> {
  const url =
    `https://api.openweathermap.org/data/2.5/weather` +
    `?lat=${coords.latitude}&lon=${coords.longitude}&units=imperial&appid=${API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const body = await response.json();
  return {
    temperatureF: Math.round(body.main?.temp ?? 0),
    feelsLikeF: Math.round(body.main?.feels_like ?? body.main?.temp ?? 0),
    condition: body.weather?.[0]?.main ?? 'Unknown',
    windMph: Math.round(body.wind?.speed ?? 0),
    humidityPct: Math.round(body.main?.humidity ?? 0),
    // Current-conditions endpoint carries no PoP; a forecast call would.
    precipitationChance: null,
    observedAt: new Date((body.dt ?? Date.now() / 1000) * 1000).toISOString(),
  };
}

async function fetchWeatherApi(coords: Coordinates): Promise<ArenaWeather | null> {
  const url =
    `https://api.weatherapi.com/v1/forecast.json` +
    `?key=${API_KEY}&q=${coords.latitude},${coords.longitude}&days=1&aqi=no&alerts=no`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const body = await response.json();
  const current = body.current ?? {};
  const today = body.forecast?.forecastday?.[0]?.day;

  return {
    temperatureF: Math.round(current.temp_f ?? 0),
    feelsLikeF: Math.round(current.feelslike_f ?? current.temp_f ?? 0),
    condition: current.condition?.text ?? 'Unknown',
    windMph: Math.round(current.wind_mph ?? 0),
    humidityPct: Math.round(current.humidity ?? 0),
    precipitationChance:
      typeof today?.daily_chance_of_rain === 'number' ? today.daily_chance_of_rain / 100 : null,
    observedAt: new Date().toISOString(),
  };
}

async function fetchTomorrow(coords: Coordinates): Promise<ArenaWeather | null> {
  const url =
    `https://api.tomorrow.io/v4/weather/realtime` +
    `?location=${coords.latitude},${coords.longitude}&units=imperial&apikey=${API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const body = await response.json();
  const values = body.data?.values ?? {};

  return {
    temperatureF: Math.round(values.temperature ?? 0),
    feelsLikeF: Math.round(values.temperatureApparent ?? values.temperature ?? 0),
    condition: values.weatherCode ? String(values.weatherCode) : 'Unknown',
    windMph: Math.round(values.windSpeed ?? 0),
    humidityPct: Math.round(values.humidity ?? 0),
    precipitationChance:
      typeof values.precipitationProbability === 'number'
        ? values.precipitationProbability / 100
        : null,
    observedAt: body.data?.time ?? new Date().toISOString(),
  };
}

/**
 * Never throws. A rodeo happens whether or not the weather call succeeded, and
 * a thrown error here would take a screen down over a nicety.
 */
export async function getArenaWeather(coords: Coordinates): Promise<ArenaWeather | null> {
  if (!weatherConfigured()) return null;

  try {
    switch (PROVIDER) {
      case 'weatherapi':
        return await fetchWeatherApi(coords);
      case 'tomorrow':
        return await fetchTomorrow(coords);
      case 'openweather':
      default:
        return await fetchOpenWeather(coords);
    }
  } catch {
    return null;
  }
}
