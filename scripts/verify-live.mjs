#!/usr/bin/env node
/**
 * Verify this app against the REAL Supabase project.
 *
 * WHY THIS EXISTS
 *
 * Everything in `npm test` is verified without touching production: the rule
 * engine as pure functions, every column against a schema snapshot, and the
 * whole data layer over HTTP against a local PostgREST double. What none of it
 * proves is the last hop — the real host, a real JWT, and RLS enforced
 * server-side on a live query.
 *
 * That hop could not be exercised where this app was built: the sandbox blocks
 * the Supabase host at an organisation egress policy. So rather than leave the
 * gap described in prose, this is the check itself. Run it anywhere with
 * network access and it answers in about ten seconds.
 *
 *   node scripts/verify-live.mjs
 *
 * It reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from
 * .env, creates a throwaway account, exercises the paths that matter, and
 * deletes the account on the way out.
 *
 * WHAT IT PROVES, AND WHAT IT DOES NOT
 *
 * It proves the client reaches the real API, that sign-up provisions a
 * contestant row, that RLS lets a signed-in person read their own data and
 * refuses somebody else's, and that the deployed edge functions answer. It
 * does not test the UI, and it does not test push delivery — that needs a
 * device token from a real handset.
 *
 * SAFE TO RUN AGAINST PRODUCTION. It only ever creates and destroys one
 * throwaway account, and every write is scoped to it. It does not touch
 * anybody else's rows, and the deletion path it uses is the same one the app
 * offers a real user.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// --- config -----------------------------------------------------------------

function loadEnv() {
  const path = join(root, '.env');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * The event code this app is about, read from the app's own theme.
 *
 * The same script ships in all seven repos and each is a different event, so
 * hardcoding one here would make six of them write a run the producer never
 * ran. Read by regex rather than by importing the module: this is plain Node
 * with no bundler and no alias resolution, and a regex over one well-known
 * line is less machinery than a loader hook for a single string.
 */
function readTheme() {
  const source = readFileSync(join(root, 'src', 'constants', 'theme.ts'), 'utf8');

  // Each entry of the EVENTS list, in order. Read by regex rather than by
  // importing the module: this is plain Node with no bundler and no alias
  // resolution, and a regex over a well-known literal is less machinery than
  // a loader hook. `npm test` asserts the shape this depends on.
  const events = [
    ...source.matchAll(
      /\{\s*code:\s*["']([a-z0-9_]+)["'],\s*label:\s*["']([^"']+)["'],\s*resultKind:\s*["'](time|score)["']\s*\}/g,
    ),
  ].map((m) => ({ code: m[1], label: m[2], resultKind: m[3] }));

  if (events.length === 0) {
    console.error(
      'Could not read the EVENTS list out of src/constants/theme.ts.\n' +
        'If its shape changed, this script has to change with it.',
    );
    process.exit(2);
  }

  return events;
}

const env = { ...loadEnv(), ...process.env };
const URL = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set.\n' +
      'Copy .env.example to .env and fill them in first.',
  );
  process.exit(2);
}

const EVENTS = readTheme();
const EVENT_CODES = EVENTS.map((e) => e.code);
const EVENT = EVENTS[0];
const EVENT_CODE = EVENT.code;

// Roughstock is judged out of 100 and everything else is on the clock, and on
// a mixed card that varies event by event — so the run this script writes is
// shaped by the event it is written under, not by the app. Otherwise the check
// would only prove that the wrong column accepts a number.
const JUDGED = EVENT.resultKind === 'score';
const RESULT = JUDGED ? { final_score: 82, final_time: null } : { final_time: 8.4, final_score: null };

// --- tiny harness -----------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}\n       ${message}`);
    console.log(`  FAIL ${name}`);
    console.log(`       ${message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- the checks -------------------------------------------------------------

const stamp = Date.now();
const EMAIL = `verify-${stamp}@example.invalid`;
const PASSWORD = `Verify!${stamp}`;

const anon = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`\nVerifying against ${URL}\n`);

console.log('Reachability and public data');

await check('the API answers', async () => {
  const { error } = await anon.from('reference_options').select('code').limit(1);
  assert(!error, error?.message ?? 'no response');
});

await check(`this app's event codes exist in reference data`, async () => {
  const { data, error } = await anon
    .from('reference_options')
    .select('code')
    .eq('domain', 'event_type');
  assert(!error, error?.message);
  assert((data?.length ?? 0) > 0, 'no event types came back — is the seed applied?');

  // Not just "some rows came back": the codes THIS app filters on have to be
  // among them. A code that exists only in the app is the failure that shows
  // up as an empty rodeo list with no error anywhere.
  const known = new Set(data.map((row) => row.code));
  const missing = EVENT_CODES.filter((code) => !known.has(code));
  assert(
    missing.length === 0,
    `the database has no event_type row for: ${missing.join(', ')}`,
  );
});

await check('private tables are NOT readable signed out', async () => {
  const { data, error } = await anon.from('users').select('id').limit(1);
  // RLS returns an empty set rather than an error for a denied select.
  assert(!error || error.code === 'PGRST301', `unexpected error: ${error?.message}`);
  assert((data?.length ?? 0) === 0, 'a signed-out caller read the users table');
});

console.log('\nSign-up and provisioning');

let session = null;
let profileId = null;

await check('sign-up succeeds', async () => {
  const { data, error } = await anon.auth.signUp({
    email: EMAIL,
    password: PASSWORD,
    options: { data: { first_name: 'Verify', last_name: 'Script' } },
  });
  assert(!error, error?.message);
  session = data.session;
  assert(
    session,
    'no session returned — email confirmation is on for this project, so the ' +
      'rest of this script cannot run. Turn it off for a moment, or confirm ' +
      'the address and re-run.',
  );
});

const auth = session
  ? createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    })
  : null;

await check('the sign-up created a contestant row', async () => {
  assert(auth, 'skipped: no session');
  const { data, error } = await auth
    .from('users')
    .select('id, first_name, last_name')
    .eq('supabase_auth_id', session.user.id)
    .limit(1);
  assert(!error, error?.message);
  assert(data?.length === 1, 'no profile row — the on_auth_user_created trigger did not fire');
  assert(data[0].first_name === 'Verify', `name not carried through: ${data[0].first_name}`);
  profileId = data[0].id;
});

console.log('\nRLS with a real token');

await check('a signed-in person reads their own profile', async () => {
  assert(auth && profileId, 'skipped');
  const { data, error } = await auth.from('users').select('id').eq('id', profileId);
  assert(!error, error?.message);
  assert(data?.length === 1, 'could not read own profile');
});

await check('a signed-in person cannot read anybody else', async () => {
  assert(auth && profileId, 'skipped');
  const { data, error } = await auth.from('users').select('id').neq('id', profileId).limit(5);
  assert(!error, error?.message);
  assert((data?.length ?? 0) === 0, `read ${data.length} other people's rows`);
});

await check('a practice run can be logged and read back', async () => {
  assert(auth && profileId, 'skipped');
  const { error: writeError } = await auth.from('career_runs').insert({
    contestant_id: profileId,
    rodeo_name: 'Verification',
    event_code: EVENT_CODE,
    run_date: new Date().toISOString().slice(0, 10),
    ...RESULT,
    source: 'self_reported',
    is_verified: false,
    org_id: null,
  });
  assert(!writeError, writeError?.message);

  const { data, error } = await auth
    .from('career_runs')
    .select('id, source, is_verified, final_time, final_score')
    .eq('contestant_id', profileId);
  assert(!error, error?.message);
  assert(data?.length === 1, 'the run did not come back');
  assert(data[0].source === 'self_reported', 'a hand-timed run was not marked self-reported');
  if (JUDGED) {
    assert(data[0].final_score !== null, 'a judged ride came back with no score');
    assert(data[0].final_time === null, 'a judged ride was filed as a time');
  } else {
    assert(data[0].final_time !== null, 'a timed run came back with no time');
  }
});

await check('a contestant cannot forge an official run', async () => {
  assert(auth && profileId, 'skipped');
  const { error } = await auth.from('career_runs').insert({
    contestant_id: profileId,
    rodeo_name: 'Forged',
    event_code: EVENT_CODE,
    run_date: new Date().toISOString().slice(0, 10),
    source: 'platform',
    is_verified: true,
  });
  assert(error, 'RLS allowed a contestant to write a verified platform run');
});

console.log('\nDeployed functions');

await check('analyse-run is deployed and rejects an unauthenticated call', async () => {
  const res = await fetch(`${URL}/functions/v1/analyse-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_code: EVENT_CODE, frame_urls: [] }),
  });
  assert(res.status !== 404, 'analyse-run is not deployed');
  assert(res.status >= 400, `expected a rejection, got ${res.status}`);
});

await check('analyse-run answers a signed-in caller', async () => {
  assert(session, 'skipped');
  const res = await fetch(`${URL}/functions/v1/analyse-run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    // No frames on purpose: this checks the function runs and validates, not
    // that a model call succeeds. A real analysis costs money.
    body: JSON.stringify({ event_code: EVENT_CODE, frame_urls: [] }),
  });
  const body = await res.json().catch(() => ({}));
  assert(res.status !== 404, 'analyse-run is not deployed');
  const message = String(body.error ?? '');
  if (message.includes('OPENAI_API_KEY')) {
    throw new Error(
      'reached the function, but OPENAI_API_KEY is not set on the project. ' +
        'Set it under Edge Functions -> Secrets.',
    );
  }
  assert(
    message.includes('No frames') || message.includes('frame'),
    `unexpected answer: ${message || res.status}`,
  );
});

console.log('\nCleanup');

await check('the account deletes itself', async () => {
  assert(session, 'skipped');
  const res = await fetch(`${URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await res.json().catch(() => ({}));
  assert(res.status !== 404, 'delete-account is not deployed');
  assert(body.success, body.error ?? `deletion failed (${res.status})`);
});

// --- report -----------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('Failures:');
  for (const f of failures) console.log(`  - ${f}`);
  console.log(
    '\nIf the account was created but not deleted, remove it from ' +
      'Authentication -> Users in the dashboard.\n',
  );
  process.exit(1);
}

console.log('The app reaches the real project, RLS holds, and the functions answer.\n');
