// Expo app config. Values that differ per build environment come from
// EXPO_PUBLIC_* env vars so a fresh clone runs without editing this file.
module.exports = {
  expo: {
    name: "Breakaway Roping",
    slug: "breakawayroping",
    scheme: "breakawayroping",
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    splash: {
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
      },
    },
    android: {
      package: "pro.breakawayroping.app",
      adaptiveIcon: {
        backgroundColor: "#070c15",
      },
      edgeToEdgeEnabled: true,
    },
    web: { bundler: 'metro', output: 'static' },
    plugins: ['expo-router', 'expo-video'],
    experiments: { typedRoutes: true },
    extra: {
      domain: "breakawayroping.pro",
      eventType: "breakaway",
    },
  },
};
