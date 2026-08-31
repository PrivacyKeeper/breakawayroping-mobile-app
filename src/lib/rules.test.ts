// src/lib/rules.test.ts
//
// The rules screen must show the engine's rules, and the engine must stay
// reachable from a screen.
//
// This app shipped for a while with a complete, tested rule engine that no
// screen imported. Nothing failed — the tests passed, the bundle built, and
// the most carefully built part of the app simply never ran. That is the
// failure this file exists to make impossible.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as scoring from './scoring/index.ts';
import { RULES_HEADING, RULES_INTRO, RUN_ENDING_RULES } from './rules.ts';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');

test('the rules screen reads the engine’s own table, not a copy of it', () => {
  // Identity, not equality. A second table that merely agrees today is exactly
  // what drifts: the app would tell somebody one thing and score them by
  // another, and both would look right in isolation.
  const isTheEnginesTable = Object.values(scoring).some((value) => value === RUN_ENDING_RULES);

  assert.ok(
    isTheEnginesTable,
    'RUN_ENDING_RULES is not the object the scoring engine exports — it has been copied',
  );
});

test('every rule says what it is, in words a person can read', () => {
  const codes = Object.keys(RUN_ENDING_RULES);
  assert.ok(codes.length > 0, 'no rules at all');

  for (const [code, rule] of Object.entries(RUN_ENDING_RULES)) {
    assert.match(code, /^[A-Z][A-Z0-9_]*$/, `rule code is not a constant: ${code}`);
    // Prose, not a restated code. "No catch" is a complete rule and only eight
    // characters, so length is the wrong test — what matters is that it reads
    // like a sentence a judge would say rather than like NO_CATCH.
    const text = rule.rule.trim();
    assert.ok(text.length > 0, `${code} has no rule text`);
    assert.ok(!text.includes('_'), `${code} restates its own code: ${text}`);
    assert.match(text, /^[A-Z]/, `${code} rule text does not start as a sentence: ${text}`);
    // The screen prints seconds and status verbatim, so a wrong shape here is
    // a wrong claim on a screen at an arena.
    if (rule.seconds !== undefined) {
      assert.ok(Number.isFinite(rule.seconds) && rule.seconds > 0, `${code} has bad seconds`);
    }
    if (rule.status !== undefined) {
      assert.ok(['no_time', 'dq'].includes(rule.status), `${code} has status ${rule.status}`);
    }
  }
});

test('the screen has its own words for this event', () => {
  assert.ok(RULES_HEADING.trim().length > 0);
  assert.ok(RULES_INTRO.trim().length > 20);
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

test('the rule engine is reachable from a screen', () => {
  // The guard that would have caught the original miss. It does not care WHICH
  // screen — only that the engine is not sitting there, fully tested, wired to
  // nothing.
  const reached = sourceFiles(join(srcRoot, 'screens')).some((file) => {
    const source = readFileSync(file, 'utf8');
    return /from '@\/lib\/(rules|scoring)/.test(source);
  });

  assert.ok(
    reached,
    'no screen imports the rule engine or the rules table — it is dead code again',
  );
});
