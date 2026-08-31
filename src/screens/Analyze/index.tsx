// src/screens/Analyze/index.tsx
//
// The run analyser.
//
// WHAT THIS SCREEN DOES AND DOES NOT DO, STATED PLAINLY
//
// The analysis engine in `src/lib/pose` is real and tested: capture guidance,
// the identity embedding, baseline building, and the judge that turns
// measurements into coded faults. What does not exist is the thing that
// produces `PoseFrame[]` from a camera — there is no pose model in
// package.json, as AI_ANALYSIS.md says in its own words.
//
// So this screen does not pretend to film anything. Showing a camera that
// silently produced no faults would be worse than showing nothing: a roper
// would conclude their run was clean.
//
// What it does instead is the part that is genuinely ready and genuinely
// useful today — the fault taxonomy for this event, in the roper's language,
// with the drill attached to each one. That is the coaching content the engine
// will emit against, readable before a single frame is captured, and it makes
// the codes reviewable by the people who will argue about them.

import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { app as appMeta, colors, radius } from '@/constants/theme';
import { event as eventTaxonomy } from '@/lib/pose';
import type { FaultDefinition, FaultSeverity } from '@/lib/pose';

const SEVERITY_TONE: Record<FaultSeverity, string> = {
  low: colors.muted,
  medium: colors.warning,
  high: colors.danger,
};

function Pill({ label, tone }: { label: string; tone: string }) {
  return (
    <View
      style={{
        borderColor: tone,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color: tone, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function FaultCard({ fault }: { fault: FaultDefinition }) {
  // The highest threshold band is the one worth showing: it is the point at
  // which the engine calls this a real problem rather than a tendency.
  const worst = (Object.keys(fault.thresholds) as FaultSeverity[]).at(-1) ?? 'high';

  return (
    <Card title={fault.label} subtitle={fault.description}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pill label={fault.attributedTo} tone={colors.accent} />
        <Pill label={worst} tone={SEVERITY_TONE[worst]} />
        <Pill label={fault.code} tone={colors.border} />
      </View>
      {fault.drill ? (
        <Text style={{ color: colors.accentAlt, fontSize: 13, lineHeight: 20 }}>
          Drill: {fault.drill}
        </Text>
      ) : null}
    </Card>
  );
}

export function AnalyzeScreen() {
  const faults: FaultDefinition[] = eventTaxonomy.TAXONOMY.definitions;

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>
          What the analyser looks for
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
          {appMeta.eventLabel} is {faults.length} things that can go wrong, each measured against
          your own body rather than somebody else&apos;s idea of perfect.
        </Text>
      </View>

      <Card
        title="Filming is not switched on yet"
        subtitle={
          'The measuring engine is finished and tested. What is missing is the on-device pose model that turns video into measurements — until it is connected, this screen will not film a run. ' +
          'It could show you a camera and a spinner. It would then tell you your run was clean because it measured nothing, and that is a worse answer than this one.'
        }
      />

      <Card
        title="How it will work"
        subtitle="You film a walk-around of yourself and the horse standing still, once. That gives your real proportions and a personal resting baseline. Every run after that is measured as a deviation from it — which is why the coaching below can be specific rather than generic."
      />

      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>The fault list</Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
          Fixed codes, not written by a model. The same mistake is named the same way for every
          roper, which is the only reason a coach can count how many people on a roster share it.
        </Text>
      </View>

      {faults.map((fault) => (
        <FaultCard key={fault.code} fault={fault} />
      ))}
    </Screen>
  );
}
