#!/usr/bin/env node
// Scaffold generator for the seven RodeoApps event apps.
//
// Emits the parts that are genuinely identical across all seven — build
// config, theme plumbing, router shell, tab chrome, Supabase client. The
// parts that are NOT identical (the rule engine, the AI feature vector, the
// event tables) are written per app by hand and copied in by build.sh,
// because those are the parts where being generic would be being wrong.

const fs = require('fs');
const path = require('path');
const { APPS } = require('./apps.config.js');

const OUT_ROOT = process.env.OUT_ROOT || '/workspace';

function write(appDir, relPath, contents) {
  const full = path.join(appDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents.endsWith('\n') ? contents : contents + '\n');
}

const J = (o) => JSON.stringify(o, null, 2);

// ---------------------------------------------------------------------------
// Build config
// ---------------------------------------------------------------------------

function packageJson(app) {
  return J({
    name: app.repo,
    version: '0.1.0',
    main: 'index.ts',
    scripts: {
      start: 'expo start',
      android: 'expo run:android',
      ios: 'expo run:ios',
      web: 'expo start --web',
      lint: 'expo lint',
      typecheck: 'tsc --noEmit',
      test: 'node --test "src/**/*.test.ts"',
    },
    dependencies: {
      '@expo/vector-icons': '^15.0.3',
      '@react-native-async-storage/async-storage': '^2.2.0',
      '@supabase/supabase-js': '^2.93.2',
      '@tanstack/react-query': '^5.62.0',
      expo: '^55.0.8',
      'expo-camera': '~55.0.11',
      'expo-constants': '~55.0.9',
      'expo-file-system': '~55.0.11',
      'expo-font': '~55.0.4',
      'expo-image-picker': '~55.0.13',
      'expo-linking': '~55.0.9',
      'expo-router': '~55.0.8',
      'expo-status-bar': '~55.0.4',
      'expo-video': '~55.0.11',
      'expo-video-thumbnails': '~55.0.11',
      react: '19.2.0',
      'react-dom': '19.2.0',
      'react-native': '0.83.2',
      'react-native-gesture-handler': '^2.30.0',
      'react-native-reanimated': '4.2.1',
      'react-native-safe-area-context': '^5.7.0',
      'react-native-screens': '^4.20.0',
      'react-native-url-polyfill': '^2.0.0',
      uniwind: '^0.4.0',
      zustand: '^5.0.3',
    },
    devDependencies: {
      '@types/react': '~19.2.0',
      typescript: '~5.9.2',
    },
    private: true,
  });
}

function appConfig(app) {
  return [
    '// Expo app config. Values that differ per build environment come from',
    '// EXPO_PUBLIC_* env vars so a fresh clone runs without editing this file.',
    'module.exports = {',
    '  expo: {',
    `    name: ${JSON.stringify(app.name)},`,
    `    slug: ${JSON.stringify(app.slug)},`,
    `    scheme: ${JSON.stringify(app.slug)},`,
    "    version: '0.1.0',",
    "    orientation: 'portrait',",
    "    userInterfaceStyle: 'dark',",
    '    newArchEnabled: true,',
    '    splash: {',
    "      resizeMode: 'contain',",
    `      backgroundColor: ${JSON.stringify(app.palette.bg)},`,
    '    },',
    '    ios: {',
    '      supportsTablet: true,',
    `      bundleIdentifier: ${JSON.stringify(app.bundle)},`,
    '      infoPlist: {',
    `        NSCameraUsageDescription: 'Record your runs so ${app.short} can analyse them.',`,
    `        NSMicrophoneUsageDescription: 'Capture audio alongside your run video.',`,
    `        NSPhotoLibraryUsageDescription: 'Pick a run video to analyse.',`,
    '      },',
    '    },',
    '    android: {',
    `      package: ${JSON.stringify(app.bundle)},`,
    '      adaptiveIcon: {',
    `        backgroundColor: ${JSON.stringify(app.palette.bg)},`,
    '      },',
    '      edgeToEdgeEnabled: true,',
    '    },',
    "    web: { bundler: 'metro', output: 'static' },",
    "    plugins: ['expo-router', 'expo-video'],",
    '    experiments: { typedRoutes: true },',
    '    extra: {',
    `      domain: ${JSON.stringify(app.domain)},`,
    `      eventType: ${JSON.stringify(app.event)},`,
    '    },',
    '  },',
    '};',
  ].join('\n');
}

const TSCONFIG = J({
  extends: 'expo/tsconfig.base',
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    // Imports inside src/lib carry explicit .ts extensions so the engines run
    // under `node --test` with no build step, the same way the Rodeo OS
    // engine package does. Metro resolves explicit extensions fine.
    allowImportingTsExtensions: true,
    noEmit: true,
    paths: { '@/*': ['src/*'] },
  },
  include: ['**/*.ts', '**/*.tsx', '.expo/types/**/*.ts', 'expo-env.d.ts'],
});

const BABEL = [
  'module.exports = function (api) {',
  '  api.cache(true);',
  '  return {',
  "    presets: ['babel-preset-expo'],",
  "    plugins: ['react-native-reanimated/plugin'],",
  '  };',
  '};',
].join('\n');

const METRO = [
  "const { getDefaultConfig } = require('expo/metro-config');",
  "const { withUniwindConfig } = require('uniwind/metro');",
  '',
  'const config = getDefaultConfig(__dirname);',
  '',
  "module.exports = withUniwindConfig(config, { cssEntryFile: './global.css' });",
].join('\n');

const GITIGNORE = [
  'node_modules/',
  '.expo/',
  'dist/',
  'web-build/',
  '*.log',
  '.env',
  '.env.local',
  '.DS_Store',
  'ios/',
  'android/',
  'expo-env.d.ts',
  'uniwind-types.d.ts',
].join('\n');

const EAS = J({
  cli: { version: '>= 12.0.0', appVersionSource: 'remote' },
  build: {
    development: { developmentClient: true, distribution: 'internal' },
    preview: { distribution: 'internal' },
    production: { autoIncrement: true },
  },
  submit: { production: {} },
});

const INDEX_TS = [
  "import 'react-native-url-polyfill/auto';",
  "import 'expo-router/entry';",
].join('\n');

function globalCss(app) {
  const p = app.palette;
  return [
    '@import "tailwindcss";',
    '@import "uniwind";',
    '',
    '/* Palette read from the shipped ' + app.domain + ' stylesheet, so the app',
    '   matches the site a user just came from. */',
    '@theme {',
    `  --color-background: ${p.bg};`,
    `  --color-surface: ${p.surface};`,
    `  --color-card: ${p.card};`,
    `  --color-border: ${p.border};`,
    `  --color-text: ${p.text};`,
    `  --color-muted: ${p.muted};`,
    `  --color-accent: ${p.accent};`,
    `  --color-accentAlt: ${p.accentAlt};`,
    `  --color-cream: ${p.cream};`,
    '  --color-success: #4ba36b;',
    '  --color-warning: #d99a2b;',
    '  --color-danger: #c8503f;',
    '}',
  ].join('\n');
}

function themeTs(app) {
  const p = app.palette;
  return [
    '// src/constants/theme.ts',
    '//',
    `// Read from the live ${app.domain} stylesheet rather than from the spine`,
    '// document. Where the two disagree the shipped site wins: a user opening',
    '// the app straight off the website should not feel a colour change.',
    '',
    'export const colors = {',
    `  background: '${p.bg}',`,
    `  surface: '${p.surface}',`,
    `  card: '${p.card}',`,
    `  border: '${p.border}',`,
    `  text: '${p.text}',`,
    `  muted: '${p.muted}',`,
    `  accent: '${p.accent}',`,
    `  accentAlt: '${p.accentAlt}',`,
    `  cream: '${p.cream}',`,
    "  success: '#4ba36b',",
    "  warning: '#d99a2b',",
    "  danger: '#c8503f',",
    '} as const;',
    '',
    'export const app = {',
    `  name: ${JSON.stringify(app.name)},`,
    `  short: ${JSON.stringify(app.short)},`,
    `  domain: ${JSON.stringify(app.domain)},`,
    `  eventType: ${JSON.stringify(app.event)},`,
    `  eventLabel: ${JSON.stringify(app.eventLabel)},`,
    `  tagline: ${JSON.stringify(app.tagline)},`,
    `  associations: ${JSON.stringify(app.associations)} as readonly string[],`,
    '} as const;',
    '',
    '// Spacing follows the house rule from the BarrelConnect cursor rules:',
    '// screens px-5 py-6 gap-y-6, cards p-4 rounded-2xl gap-y-2.',
    'export const spacing = { screenX: 20, screenY: 24, gap: 24, cardPad: 16 } as const;',
    'export const radius = { card: 16, pill: 999, control: 12 } as const;',
  ].join('\n');
}

const SUPABASE_TS = [
  '// src/lib/supabase.ts',
  '',
  "import AsyncStorage from '@react-native-async-storage/async-storage';",
  "import { createClient } from '@supabase/supabase-js';",
  '',
  'const url = process.env.EXPO_PUBLIC_SUPABASE_URL;',
  'const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;',
  '',
  'if (!url || !anonKey) {',
  '  // Fail loudly at startup rather than with an opaque network error on the',
  '  // first query. A missing env var is a setup problem, not a runtime one.',
  '  console.warn(',
  "    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. " +
    "Copy .env.example to .env and fill them in.',",
  '  );',
  '}',
  '',
  "export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'anon', {",
  '  auth: {',
  '    storage: AsyncStorage,',
  '    autoRefreshToken: true,',
  '    persistSession: true,',
  '    detectSessionInUrl: false,',
  '  },',
  '});',
].join('\n');

const ENV_EXAMPLE = [
  '# Copy to .env and fill in. Both are public client keys; RLS is what',
  '# protects the data, not the secrecy of these values.',
  'EXPO_PUBLIC_SUPABASE_URL=',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY=',
].join('\n');

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const ROOT_LAYOUT = [
  "import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
  "import { Stack } from 'expo-router';",
  "import { StatusBar } from 'expo-status-bar';",
  "import { SafeAreaProvider } from 'react-native-safe-area-context';",
  '',
  "import { colors } from '@/constants/theme';",
  '',
  'const queryClient = new QueryClient({',
  '  defaultOptions: {',
  '    queries: {',
  '      // Arena connectivity is poor by default, not exceptionally. Serve',
  '      // cached data rather than a spinner whenever we plausibly can.',
  '      staleTime: 60_000,',
  '      retry: 2,',
  '    },',
  '  },',
  '});',
  '',
  'export default function RootLayout() {',
  '  return (',
  '    <QueryClientProvider client={queryClient}>',
  '      <SafeAreaProvider>',
  '        <StatusBar style="light" />',
  '        <Stack',
  '          screenOptions={{',
  '            headerStyle: { backgroundColor: colors.background },',
  '            headerTintColor: colors.text,',
  "            headerTitleStyle: { color: colors.text, fontWeight: '600' },",
  '            contentStyle: { backgroundColor: colors.background },',
  '          }}',
  '        >',
  '          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />',
  '        </Stack>',
  '      </SafeAreaProvider>',
  '    </QueryClientProvider>',
  '  );',
  '}',
].join('\n');

const ICON_MAP = {
  home: 'home',
  calendar: 'calendar',
  stopwatch: 'stopwatch',
  paw: 'paw',
  person: 'person',
  people: 'people',
  shuffle: 'shuffle',
  trophy: 'trophy',
  fitness: 'fitness',
};

function tabsLayout(app) {
  const screens = app.tabs
    .map((tab) => {
      const icon = ICON_MAP[tab.icon] || 'ellipse';
      return [
        '      <Tabs.Screen',
        `        name="${tab.name}"`,
        '        options={{',
        `          title: ${JSON.stringify(tab.title)},`,
        '          tabBarIcon: ({ color, size }) => (',
        `            <Ionicons name="${icon}-outline" color={color} size={size} />`,
        '          ),',
        '        }}',
        '      />',
      ].join('\n');
    })
    .join('\n');

  return [
    "import Ionicons from '@expo/vector-icons/Ionicons';",
    "import { Tabs } from 'expo-router';",
    '',
    "import { colors } from '@/constants/theme';",
    '',
    'export default function TabsLayout() {',
    '  return (',
    '    <Tabs',
    '      screenOptions={{',
    '        tabBarActiveTintColor: colors.accent,',
    '        tabBarInactiveTintColor: colors.muted,',
    '        tabBarStyle: {',
    '          backgroundColor: colors.surface,',
    '          borderTopColor: colors.border,',
    '        },',
    '        headerStyle: { backgroundColor: colors.background },',
    '        headerTintColor: colors.text,',
    '        headerTitleStyle: { color: colors.text },',
    '        sceneStyle: { backgroundColor: colors.background },',
    '      }}',
    '    >',
    screens,
    '    </Tabs>',
    '  );',
    '}',
  ].join('\n');
}

function tabRoute(app, tab) {
  const screenName = tab.name === 'index' ? 'Home' : cap(tab.name);
  return [
    `import { ${screenName}Screen } from '@/screens/${screenName}';`,
    '',
    `export default function ${screenName}Route() {`,
    `  return <${screenName}Screen />;`,
    '}',
  ].join('\n');
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

const SCREEN_COMPONENT = [
  '// src/components/ui/Screen/index.tsx',
  '//',
  '// Every screen sits on this. Keeps the house padding rule in one place',
  '// instead of copied into thirty files.',
  '',
  "import type { ReactNode } from 'react';",
  "import { ScrollView, View } from 'react-native';",
  "import { useSafeAreaInsets } from 'react-native-safe-area-context';",
  '',
  "import { colors, spacing } from '@/constants/theme';",
  '',
  'type ScreenProps = {',
  '  children: ReactNode;',
  '  scroll?: boolean;',
  '};',
  '',
  'export function Screen({ children, scroll = true }: ScreenProps) {',
  '  const insets = useSafeAreaInsets();',
  '  const style = {',
  '    flex: 1,',
  '    backgroundColor: colors.background,',
  '  } as const;',
  '  const contentStyle = {',
  '    paddingHorizontal: spacing.screenX,',
  '    paddingTop: spacing.screenY,',
  '    paddingBottom: spacing.screenY + insets.bottom,',
  '    gap: spacing.gap,',
  '  } as const;',
  '',
  '  if (!scroll) {',
  '    return <View style={[style, contentStyle]}>{children}</View>;',
  '  }',
  '  return (',
  '    <ScrollView style={style} contentContainerStyle={contentStyle}>',
  '      {children}',
  '    </ScrollView>',
  '  );',
  '}',
].join('\n');

const CARD_COMPONENT = [
  '// src/components/ui/Card/index.tsx',
  '',
  "import type { ReactNode } from 'react';",
  "import { Text, View } from 'react-native';",
  '',
  "import { colors, radius, spacing } from '@/constants/theme';",
  '',
  'type CardProps = {',
  '  title?: string;',
  '  subtitle?: string;',
  '  children?: ReactNode;',
  '};',
  '',
  'export function Card({ title, subtitle, children }: CardProps) {',
  '  return (',
  '    <View',
  '      style={{',
  '        backgroundColor: colors.card,',
  '        borderColor: colors.border,',
  '        borderWidth: 1,',
  '        borderRadius: radius.card,',
  '        padding: spacing.cardPad,',
  '        gap: 8,',
  '      }}',
  '    >',
  '      {title ? (',
  "        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>",
  '      ) : null}',
  '      {subtitle ? (',
  '        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{subtitle}</Text>',
  '      ) : null}',
  '      {children}',
  '    </View>',
  '  );',
  '}',
].join('\n');

const BUTTON_COMPONENT = [
  '// src/components/ui/Button/index.tsx',
  '',
  "import { Pressable, Text } from 'react-native';",
  '',
  "import { colors, radius } from '@/constants/theme';",
  '',
  'type ButtonProps = {',
  '  label: string;',
  '  onPress?: () => void;',
  "  variant?: 'primary' | 'secondary';",
  '  disabled?: boolean;',
  '};',
  '',
  "export function Button({ label, onPress, variant = 'primary', disabled }: ButtonProps) {",
  "  const isPrimary = variant === 'primary';",
  '  return (',
  '    <Pressable',
  '      onPress={onPress}',
  '      disabled={disabled}',
  '      style={({ pressed }) => ({',
  '        backgroundColor: isPrimary ? colors.accent : colors.surface,',
  '        borderColor: isPrimary ? colors.accent : colors.border,',
  '        borderWidth: 1,',
  '        borderRadius: radius.control,',
  '        paddingVertical: 14,',
  '        paddingHorizontal: 20,',
  "        alignItems: 'center',",
  '        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,',
  '      })}',
  '    >',
  '      <Text',
  '        style={{',
  '          color: isPrimary ? colors.background : colors.text,',
  "          fontWeight: '600',",
  '          fontSize: 15,',
  '        }}',
  '      >',
  '        {label}',
  '      </Text>',
  '    </Pressable>',
  '  );',
  '}',
].join('\n');

const STAT_COMPONENT = [
  '// src/components/ui/Stat/index.tsx',
  '',
  "import { Text, View } from 'react-native';",
  '',
  "import { colors } from '@/constants/theme';",
  '',
  'type StatProps = {',
  '  label: string;',
  '  value: string;',
  '  hint?: string;',
  '};',
  '',
  'export function Stat({ label, value, hint }: StatProps) {',
  '  return (',
  '    <View style={{ gap: 2 }}>',
  '      <Text',
  '        style={{',
  '          color: colors.muted,',
  '          fontSize: 11,',
  "          textTransform: 'uppercase',",
  '          letterSpacing: 0.8,',
  '        }}',
  '      >',
  '        {label}',
  '      </Text>',
  "      <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>{value}</Text>",
  '      {hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}',
  '    </View>',
  '  );',
  '}',
].join('\n');

const EMPTY_COMPONENT = [
  '// src/components/ui/EmptyState/index.tsx',
  '//',
  "// Empty states say what to do next rather than 'no data'. Most of these",
  '// screens are empty for a new user, so this component carries a lot of the',
  "// app's first impression.",
  '',
  "import { Text, View } from 'react-native';",
  '',
  "import { Button } from '@/components/ui/Button';",
  "import { colors } from '@/constants/theme';",
  '',
  'type EmptyStateProps = {',
  '  title: string;',
  '  body: string;',
  '  actionLabel?: string;',
  '  onAction?: () => void;',
  '};',
  '',
  'export function EmptyState({ title, body, actionLabel, onAction }: EmptyStateProps) {',
  '  return (',
  "    <View style={{ gap: 12, alignItems: 'flex-start' }}>",
  "      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{title}</Text>",
  '      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>{body}</Text>',
  '      {actionLabel ? <Button label={actionLabel} onPress={onAction} /> : null}',
  '    </View>',
  '  );',
  '}',
].join('\n');

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function homeScreen(app) {
  const analysisLine = app.hasAnalysis
    ? "        <Card\n          title=\"Film a run\"\n          subtitle=\"Record it, and the app measures the run against your own benchmark rather than against somebody else's idea of perfect.\"\n        >\n          <Button label=\"Open the analyser\" onPress={() => router.push('/analyze')} />\n        </Card>"
    : '';
  return [
    "import { router } from 'expo-router';",
    "import { Text, View } from 'react-native';",
    '',
    "import { Button } from '@/components/ui/Button';",
    "import { Card } from '@/components/ui/Card';",
    "import { Screen } from '@/components/ui/Screen';",
    "import { app as appMeta, colors } from '@/constants/theme';",
    '',
    'export function HomeScreen() {',
    '  return (',
    '    <Screen>',
    '      <View style={{ gap: 6 }}>',
    "        <Text style={{ color: colors.accent, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase' }}>",
    '          {appMeta.domain}',
    '        </Text>',
    "        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700', lineHeight: 36 }}>",
    '          {appMeta.tagline}',
    '        </Text>',
    '      </View>',
    '',
    analysisLine,
    '',
    '      <Card',
    '        title="Log a run"',
    '        subtitle="Practice runs are kept separate from official results, permanently. Nothing you hand-time can reach a leaderboard."',
    '      >',
    "        <Button label=\"Log one\" variant=\"secondary\" onPress={() => router.push('/compete')} />",
    '      </Card>',
    '',
    '      <Card',
    '        title="Find a rodeo"',
    '        subtitle="Entries, draw and results, straight from the producer running it."',
    '      >',
    "        <Button label=\"Browse events\" variant=\"secondary\" onPress={() => router.push('/events')} />",
    '      </Card>',
    '    </Screen>',
    '  );',
    '}',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function genericScreen(name, title, body, actionLabel) {
  return [
    "import { EmptyState } from '@/components/ui/EmptyState';",
    "import { Screen } from '@/components/ui/Screen';",
    '',
    `export function ${name}Screen() {`,
    '  return (',
    '    <Screen>',
    '      <EmptyState',
    `        title={${JSON.stringify(title)}}`,
    `        body={${JSON.stringify(body)}}`,
    actionLabel ? `        actionLabel={${JSON.stringify(actionLabel)}}` : '',
    '      />',
    '    </Screen>',
    '  );',
    '}',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

const SCREEN_COPY = {
  events: {
    title: 'No rodeos yet',
    body: 'Events show up here as producers open entries. Follow one and you will get the draw and the results as they post, without refreshing anything.',
  },
  compete: {
    title: 'Nothing logged yet',
    body: 'Log a practice run and it stays yours — hand-timed runs are structurally separated from official results and cannot reach a leaderboard.',
    action: 'Log a run',
  },
  horses: {
    title: 'No horses yet',
    body: 'Add a horse once and the record follows it — health, results, and its measured baseline — including if you sell or lease it.',
    action: 'Add a horse',
  },
  profile: {
    title: 'Finish your profile',
    body: 'Add your association memberships so entry eligibility gets checked before you pay, not at the gate.',
    action: 'Edit profile',
  },
  partners: {
    title: 'Find a partner',
    body: 'Search by number, by end, and by what division the pair would land in — with the floor and cap rules checked before you enter.',
    action: 'Search ropers',
  },
  hazers: {
    title: 'Find a hazer',
    body: 'You cannot compete without one. Search by region and travel radius, agree the share up front, and settle it on a ledger you both see.',
    action: 'Search hazers',
  },
  draw: {
    title: 'No draw yet',
    body: 'When you draw a horse, everything recorded on that animal shows up here — buck pattern, jump frequency, how the trips before yours went.',
  },
  standings: {
    title: 'No standings yet',
    body: 'Placings become points the moment the last team runs, on whatever scale the producer published.',
  },
  team: {
    title: 'Build your team',
    body: 'Four to five riders with a role per event. Once an alternate replaces someone, that rider is out for the rest of the rodeo — the roster enforces it.',
    action: 'Add a rider',
  },
  body: {
    title: 'Nothing logged',
    body: 'Rides per week, per month, per season, against the injuries that followed. Over a career this is the most valuable dataset you can own about yourself. General information, never medical advice.',
    action: 'Log a ride',
  },
};

// ---------------------------------------------------------------------------
// Readme
// ---------------------------------------------------------------------------

function readme(app) {
  return [
    `# ${app.name} — mobile app`,
    '',
    `${app.tagline}`,
    '',
    `Companion app for [${app.domain}](https://www.${app.domain}). Expo + expo-router,`,
    'Supabase, TypeScript.',
    '',
    '## Running it',
    '',
    '```bash',
    'npm install',
    'cp .env.example .env      # fill in the Supabase URL and anon key',
    'npx expo start',
    '```',
    '',
    '```bash',
    'npm run typecheck',
    'npm test                  # rule engine tests, no device needed',
    '```',
    '',
    '## Layout',
    '',
    '```',
    'src/app/            expo-router routes. Thin — each one renders a screen.',
    'src/screens/        Screen components, one folder each.',
    'src/components/ui/  Shared UI.',
    `src/lib/scoring/    THE RULE ENGINE. Pure functions, unit tested.`,
    'src/lib/pose/       On-device run analysis.',
    'src/constants/      Theme and app identity.',
    'supabase/migrations/',
    '```',
    '',
    '## The rule engine',
    '',
    '`src/lib/scoring/` is the part that must not be hand-waved — it decides',
    'whether a run counts and what it pays. It is pure functions over',
    'configuration data: no database, no network, no clock, no randomness, so',
    'it is exhaustively testable and runs identically on the phone and the',
    'server.',
    '',
    '**Every rule is data.** Penalty seconds, loop counts, catch legality,',
    'time limits and association variations are all loaded from a rules',
    'profile bound to a dated rule set. A sanctioning body changing a rule',
    'mid-season is a new profile, never a deploy. Rodeo rules change annually',
    'and mid-season; code that hardcodes them is wrong by October.',
    '',
    `Sanctioning bodies that matter here: ${app.associations.join(', ')}.`,
    '',
    '## Run analysis',
    '',
    'The rider records a walk-around benchmark of herself and the horse',
    'standing still, then films runs. Runs are measured as deviation from that',
    'benchmark, on the phone. Only the numbers are uploaded; video stays on the',
    'device unless it is explicitly shared.',
    '',
    'See `AI_ANALYSIS.md` for what is wired and what still needs a model.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function aiDoc(app) {
  return [
    '# Run analysis — ' + app.name,
    '',
    'How the AI analysis in this app works, what is wired, and what is not.',
    '',
    '## The idea',
    '',
    'The contestant records a **walk-around benchmark** — themselves and the',
    'animal, standing still, head to hooves — before they film any runs. That',
    'yields their resting geometry and, where an animal is involved, its',
    'conformation. Every run afterwards is measured as a **deviation from that',
    'benchmark**, so coaching is against their own body rather than against a',
    'generic ideal that fits nobody.',
    '',
    'Three things the walk-around buys that a single reference frame does not:',
    '',
    '- **Known scale.** Head to hooves standing still is a real vertical',
    '  extent, so measurements are true proportions rather than pixel ratios.',
    '- **Camera-motion rejection.** The same subject from many angles is how',
    '  you tell a real position change from the camera moving.',
    '- **A personal baseline.** Deviation from their own rest position is a',
    '  defensible coaching statement; an absolute joint angle is not.',
    '',
    '## Where it runs',
    '',
    'On the phone. Only the numbers are uploaded — a few kilobytes instead of',
    'a few hundred megabytes — and the video stays on the device unless the',
    'contestant explicitly shares it. This is the pattern proven on Clay AI',
    'Coach and mandated by `00_RODEOAPPS_SHARED_SPINE.md`.',
    '',
    '## Why faults have codes',
    '',
    '`src/lib/pose/event.ts` holds a fixed taxonomy. Faults are emitted from',
    'measurements against that list, never written as prose by a model.',
    '',
    'That matters most for coaches. A coach report counts how many people on a',
    'roster share a fault, and the count is only meaningful if the fault is',
    'named identically every time. Ask a model to describe runs and the same',
    'fault comes back three different ways across three contestants, tallying',
    'as three separate one-person problems — which is exactly the pattern the',
    'coach needed to see. A model may still write the paragraph a human reads.',
    'It does not get to decide what happened, and it never invents a category.',
    '',
    '**Codes are permanent once shipped.** Reword a label freely; never change',
    'what a code means. Retire it, add a new one, bump the taxonomy version.',
    '',
    '## What is wired',
    '',
    '- `capture.ts` — live guidance during the walk-around, coverage scoring,',
    '  and automatic detection of which capture method is being used',
    '- `embedding.ts` — 128-d geometric identity embedding, weighted for a',
    '  mounted subject where the legs are occluded',
    '- `baseline.ts` — capture to baseline, folding repeat captures together',
    '- `judge.ts` — measurements to coded faults, and faults to a coach tally',
    '- `event.ts` — this event’s feature vector and fault taxonomy',
    '',
    '## What is NOT wired',
    '',
    '**No pose model is connected.** The engine consumes `PoseFrame[]` and',
    'nothing currently produces them — there is no pose dependency in',
    '`package.json`. This needs a VisionCamera frame processor with a TFLite',
    'MoveNet or BlazePose model. Clay AI Coach’s `src/native/PoseDetector.ts`',
    'is the closest working reference and should port with a model swap.',
    '',
    app.hasHorses || app.kind === 'judged'
      ? [
          '**No animal pose model exists.** MoveNet and BlazePose do not detect',
          'quadrupeds and there is no drop-in. `horse.ts` defines the seam:',
          '`registerHorsePoseAdapter()`. Until one is registered,',
          '`horseAvailable()` returns false, the pipeline runs contestant-only,',
          'and animal-attributed faults are simply not emitted. Nothing breaks',
          'and nothing is faked — **check `horseAvailable()` before showing an',
          'animal report rather than rendering an empty one.**',
          '',
          'The benchmark makes this much cheaper than it looks: locating a',
          'horse’s joints mid-run at speed is hard, locating them once on a',
          'still animal from a dozen angles is not, and `trackFromSeeds()`',
          'turns the run-time problem into following points already found.',
        ].join('\n')
      : '',
    '',
    '**Thresholds are unfitted.** The values in `event.ts` come from coaching',
    'convention, not from data. They are deliberately data rather than logic —',
    'once there are enough measured runs with results attached they should be',
    'fitted against what actually produced good ones. That is why measuring',
    'and judging are separate functions: refitting must not require',
    'recomputing history.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function generate(app) {
  const dir = path.join(OUT_ROOT, app.repo);
  fs.mkdirSync(dir, { recursive: true });

  write(dir, 'package.json', packageJson(app));
  write(dir, 'app.config.js', appConfig(app));
  write(dir, 'tsconfig.json', TSCONFIG);
  write(dir, 'babel.config.js', BABEL);
  write(dir, 'metro.config.js', METRO);
  write(dir, '.gitignore', GITIGNORE);
  write(dir, 'eas.json', EAS);
  write(dir, 'index.ts', INDEX_TS);
  write(dir, 'global.css', globalCss(app));
  write(dir, '.env.example', ENV_EXAMPLE);
  write(dir, 'README.md', readme(app));
  write(dir, 'AI_ANALYSIS.md', aiDoc(app));

  write(dir, 'src/constants/theme.ts', themeTs(app));
  write(dir, 'src/lib/supabase.ts', SUPABASE_TS);

  write(dir, 'src/app/_layout.tsx', ROOT_LAYOUT);
  write(dir, 'src/app/(tabs)/_layout.tsx', tabsLayout(app));

  write(dir, 'src/components/ui/Screen/index.tsx', SCREEN_COMPONENT);
  write(dir, 'src/components/ui/Card/index.tsx', CARD_COMPONENT);
  write(dir, 'src/components/ui/Button/index.tsx', BUTTON_COMPONENT);
  write(dir, 'src/components/ui/Stat/index.tsx', STAT_COMPONENT);
  write(dir, 'src/components/ui/EmptyState/index.tsx', EMPTY_COMPONENT);

  for (const tab of app.tabs) {
    write(dir, `src/app/(tabs)/${tab.name}.tsx`, tabRoute(app, tab));
    const screenName = tab.name === 'index' ? 'Home' : cap(tab.name);
    if (tab.name === 'index') {
      write(dir, 'src/screens/Home/index.tsx', homeScreen(app));
    } else {
      const copy = SCREEN_COPY[tab.name] || {
        title: tab.title,
        body: 'Coming next.',
      };
      write(
        dir,
        `src/screens/${screenName}/index.tsx`,
        genericScreen(screenName, copy.title, copy.body, copy.action),
      );
    }
  }

  const screenIndex = app.tabs
    .map((t) => {
      const n = t.name === 'index' ? 'Home' : cap(t.name);
      return `export { ${n}Screen } from './${n}';`;
    })
    .join('\n');
  write(dir, 'src/screens/index.ts', screenIndex);

  console.log(`generated ${app.repo}`);
}

for (const app of APPS) generate(app);
