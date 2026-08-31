// src/screens/Rules/index.tsx
//
// The rulebook, offline, from the engine that scores by it.
//
// This app has carried a complete rule engine since it was built — every
// penalty, every disqualification, cited to the edition a producer is running
// — and until now nothing on a screen ever read it. A tested engine no screen
// calls is not a feature; it is a thing that will drift out of true because
// nobody is looking at it.
//
// So this reads `RUN_ENDING_RULES`, which IS the engine's own table, not a
// second copy of the rulebook written for display. The app cannot tell
// somebody one thing here and score them by another.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not group the rules into "adds
// time" and "no time" unless the table says which. Most penalty amounts are
// not fixed in the engine at all — they come from the rules profile the
// producer is running, because a barrier is ten seconds under one association
// and something else under another. Sorting them into buckets would mean
// guessing, and a confident wrong answer about what ends a run is worse than
// no answer at an arena.

import { ScrollView, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { app as appMeta, colors, radius } from '@/constants/theme';
import { RULES_HEADING, RULES_INTRO, RUN_ENDING_RULES, type RunEndingRule } from '@/lib/rules';

/** 'TIE_FAILED_6S' reads badly on a phone; 'Tie failed 6s' does not. */
function humanise(code: string): string {
  const words = code.toLowerCase().split('_');
  const first = words[0] ?? '';
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
}

function consequence(rule: RunEndingRule): { text: string; tone: 'time' | 'out' | 'plain' } {
  if (typeof rule.seconds === 'number') {
    return { text: `+${rule.seconds} seconds`, tone: 'time' };
  }
  if (rule.status === 'dq') return { text: 'Disqualified', tone: 'out' };
  if (rule.status === 'no_time') return { text: 'No time', tone: 'out' };
  return { text: '', tone: 'plain' };
}

function RuleRow({ code, rule }: { code: string; rule: RunEndingRule }) {
  const { text, tone } = consequence(rule);
  const color = tone === 'time' ? colors.accent : tone === 'out' ? colors.danger : colors.muted;

  return (
    <View
      style={{
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        backgroundColor: colors.card,
        padding: 14,
        gap: 6,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }}>
          {humanise(code)}
        </Text>
        {text ? (
          <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{text}</Text>
        ) : null}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{rule.rule}</Text>
    </View>
  );
}

export function RulesScreen() {
  const entries = Object.entries(RUN_ENDING_RULES);

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>{RULES_HEADING}</Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>{RULES_INTRO}</Text>
      </View>

      <Card
        title="Amounts come from the producer"
        subtitle={
          'Where a number is not shown, the engine takes it from the rules profile the ' +
          'producer is running — a barrier is not the same everywhere, and this app ' +
          'refuses to guess rather than quote the wrong association at you.'
        }
      />

      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {entries.map(([code, rule]) => (
          <RuleRow key={code} code={code} rule={rule} />
        ))}
      </ScrollView>

      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        {entries.length} rules, and the same table {appMeta.name} scores a run with. A producer's
        own ground rules are on the rodeo's page and take precedence where they differ.
      </Text>
    </Screen>
  );
}
