// Expo app config. Values that differ per build environment come from
// EXPO_PUBLIC_* env vars so a fresh clone runs without editing this file.
module.exports = {
  expo: {
    name: "Breakaway Roping",
    slug: "breakawayroping",
    scheme: "breakawayroping",
    version: '0.1.0',
    icon: './assets/icon.png',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: "#070c15",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "pro.breakawayroping.app",
      infoPlist: {
        NSCameraUsageDescription: 'Record your runs so Breakaway can analyse them.',
        NSMicrophoneUsageDescription: 'Capture audio alongside your run video.',
        NSPhotoLibraryUsageDescription: 'Pick a run video to analyse.',
        NSLocationWhenInUseUsageDescription:
          'Find rodeos near you and drop a pin on the grounds you are standing at.',
      },
      config: {
        // Absent in dev; the map falls back to a coordinate card without it.
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
      },
    },
    android: {
      package: "pro.breakawayroping.app",
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: "#070c15",
      },
      edgeToEdgeEnabled: true,
      permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
        },
      },
    },
    web: { bundler: 'metro', output: 'static', favicon: './assets/favicon.png' },
    plugins: [
      'expo-router',
      'expo-video',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Find rodeos near you and drop a pin on the grounds you are standing at.',
        },
      ],
    ],
    experiments: { typedRoutes: true },
    extra: {
      domain: "breakawayroping.pro",
      eventType: "breakaway",
    },
  },
};
