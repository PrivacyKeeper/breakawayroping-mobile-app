// src/lib/events.test.ts
//
// Nothing may quietly assume this app is about one event.
//
// Every app here but tie-down covers more than one code, and they are not
// interchangeable: heading and heeling are two ends of the same run and a
// roper does one of them, chute dogging is not steer wrestling, and ranch
// rodeo is a card of ten. The first version of this codebase reached for
// `eventCodes[0]` wherever a code was needed, which filed a heeler's practice
// run and a heeler's video analysis under the header's code — no error, no
// symptom, just a career record for something the person does not do.
//
// The fix was to ask. This is what stops the shortcut coming back: reaching
// into the list by index is how the assumption gets made, so outside the two
// places that legitimately define the default, it is banned outright.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { app, primaryEvent } from '../constants/theme.ts';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');

/**
 * The two files allowed to name a default:
 *   theme.ts       — defines `primaryEvent`
 *   queries.ts     — re-exports it as PRIMARY_EVENT_CODE, and validates against
 *                    the full list before writing
 */
const ALLOWED = new Set(['constants/theme.ts', 'lib/queries.ts']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry) || entry.includes('.test.')) continue;
    out.push(full);
  }
  return out;
}

test('no module picks an event by reaching into the list', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(srcRoot)) {
    const rel = relative(srcRoot, file).split('\\').join('/');
    if (ALLOWED.has(rel)) continue;

    const source = readFileSync(file, 'utf8');
    // `eventCodes[0]`, `app.events[0]`, `EVENT_CODES[0]` — any of the shapes
    // that silently pick one event out of several.
    for (const match of source.matchAll(/\b(?:app\.|appMeta\.)?(?:eventCodes|events|EVENT_CODES)\[\d+\]/g)) {
      offenders.push(`${rel}: ${match[0]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `\nUse \`primaryEvent\` for a documented default, or ask which event:\n${offenders.join('\n')}`,
  );
});

test('the primary event is one this app actually covers', () => {
  assert.ok(
    app.eventCodes.includes(primaryEvent.code),
    `${primaryEvent.code} is not in eventCodes`,
  );
  assert.equal(primaryEvent.code, app.events[0]?.code);
});

test('event codes are unique', () => {
  // A duplicate would make the picker show two identical buttons and make
  // `find` on the code ambiguous.
  assert.equal(new Set(app.eventCodes).size, app.eventCodes.length);
});

test('the app-level result kind matches the events it lists', () => {
  const kinds = new Set(app.events.map((e) => e.resultKind));
  const expected = kinds.size > 1 ? 'either' : [...kinds][0];
  assert.equal(app.resultKind, expected);
});

test('the live-verification script still reads this app\'s event list', () => {
  // `scripts/verify-live.mjs` is plain Node with no bundler, so it reads the
  // EVENTS list out of theme.ts with a regex rather than importing it. That is
  // a second reader of a shape only one file owns, and the failure mode is
  // silent: reshape the literal and the script stops finding events, or worse,
  // finds some of them.
  //
  // So this pulls the script's ACTUAL regex out of its source and runs it,
  // rather than restating it here — a copy would agree with itself forever.
  const script = readFileSync(join(srcRoot, '..', 'scripts', 'verify-live.mjs'), 'utf8');
  const literal = script.match(/matchAll\(\s*\/(.+?)\/g,?\s*\)/s);
  assert.ok(literal, 'could not find the event regex in scripts/verify-live.mjs');

  const pattern = new RegExp(literal[1]!, 'g');
  const themeSource = readFileSync(join(srcRoot, 'constants', 'theme.ts'), 'utf8');
  const found = [...themeSource.matchAll(pattern)].map((m) => ({
    code: m[1],
    label: m[2],
    resultKind: m[3],
  }));

  assert.deepEqual(
    found,
    app.events.map((e) => ({ code: e.code, label: e.label, resultKind: e.resultKind })),
    'the script and the module disagree about this app\'s events',
  );
});
