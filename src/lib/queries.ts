// src/lib/queries.ts
//
// Every read this app makes, in one file.
//
// Two conventions worth stating:
//
// SUPABASE ERRORS ARE THROWN, NOT RETURNED. supabase-js resolves with
// `{ data, error }` and never rejects, so `await` on its own looks like it
// succeeded whatever happened. TanStack Query decides retries and error UI by
// whether the query function threw, so every one of these unwraps and throws.
// Returning `data ?? []` on an error would render "no rodeos" over a network
// failure, which is the worst possible answer: it looks like a fact.
//
// THE EVENT FILTER COMES FROM THE THEME. Each app in the portfolio ships the
// same code against a different `app.eventType`, so nothing here hardcodes
// 'tie_down_roping'. Getting this wrong shows a bareback rider the tie-down
// draw.

import { app as appMeta } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/**
 * The event_type codes this app is about, as they appear in the database.
 *
 * Comes from `app.eventCodes`, never `app.eventType` -- the latter is the
 * app's own slug ("tiedown") and matches no row in `reference_options`
 * ("tie_down_roping"). Filtering on it returns an empty set with no error,
 * which renders as "the producer is not running your event" at every rodeo.
 */
export const EVENT_CODES = appMeta.eventCodes;

/** The code new self-reported runs are filed under: this app's primary event. */
export const PRIMARY_EVENT_CODE = appMeta.eventCodes[0];

export type RodeoSummary = {
  id: string;
  name: string;
  slug: string | null;
  start_date: string;
  end_date: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  status: string;
  entry_close_date: string | null;
  total_added_money: number | null;
};

export type RodeoEventRow = {
  id: string;
  event_type: string;
  scoring_mode: string;
  entry_fee: number | null;
  added_money: number | null;
  num_go_rounds: number | null;
  ground_rules: string | null;
  score_line_feet: number | null;
  status: string;
};

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) {
    throw new Error(`${what}: ${result.error.message}`);
  }
  if (result.data === null) {
    throw new Error(`${what}: no data returned`);
  }
  return result.data;
}

/**
 * Rodeos a contestant can actually do something about.
 *
 * Deliberately not "all rodeos": anything already settled is history, and the
 * events tab is a place to enter something. Past rodeos belong in results.
 */
export async function listUpcomingRodeos(): Promise<RodeoSummary[]> {
  const today = new Date().toISOString().slice(0, 10);
  return unwrap(
    await supabase
      .from('rodeos')
      .select(
        'id, name, slug, start_date, end_date, venue_name, venue_city, venue_state, venue_lat, venue_lng, status, entry_close_date, total_added_money',
      )
      .in('status', ['published', 'entries_open', 'entries_closed', 'in_progress'])
      .gte('end_date', today)
      .order('start_date', { ascending: true })
      .limit(50),
    'Could not load rodeos',
  );
}

export async function getRodeo(rodeoId: string): Promise<RodeoSummary> {
  const rows = unwrap(
    await supabase
      .from('rodeos')
      .select(
        'id, name, slug, start_date, end_date, venue_name, venue_city, venue_state, venue_lat, venue_lng, status, entry_close_date, total_added_money',
      )
      .eq('id', rodeoId)
      .limit(1),
    'Could not load that rodeo',
  );
  const rodeo = rows[0];
  if (!rodeo) throw new Error('That rodeo is no longer listed.');
  return rodeo;
}

/** This app's event at a given rodeo, if the producer is running it. */
export async function getEventForRodeo(rodeoId: string): Promise<RodeoEventRow | null> {
  const rows = unwrap(
    await supabase
      .from('rodeo_events')
      .select(
        'id, event_type, scoring_mode, entry_fee, added_money, num_go_rounds, ground_rules, score_line_feet, status',
      )
      .eq('rodeo_id', rodeoId)
      .in('event_type', EVENT_CODES as string[])
      .order('sort_order', { ascending: true })
      .limit(1),
    'Could not load the event',
  );
  return rows[0] ?? null;
}

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state_province: string | null;
  memberships: unknown;
};

/**
 * The signed-in person's own profile row.
 *
 * Returns null rather than throwing when there is no row. That state is
 * reachable for an account created before the provisioning trigger existed,
 * and the profile screen can offer to fix it — throwing would show a red error
 * for something the user can resolve in one tap.
 */
export async function getMyProfile(authUserId: string): Promise<Profile | null> {
  const rows = unwrap(
    await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, city, state_province, memberships')
      .eq('supabase_auth_id', authUserId)
      .limit(1),
    'Could not load your profile',
  );
  return rows[0] ?? null;
}

export async function updateMyProfile(
  profileId: string,
  patch: Partial<Pick<Profile, 'first_name' | 'last_name' | 'phone' | 'city' | 'state_province'>>,
): Promise<void> {
  const { error } = await supabase.from('users').update(patch).eq('id', profileId);
  if (error) throw new Error(`Could not save your profile: ${error.message}`);
}

export type Horse = {
  id: string;
  barn_name: string;
  registered_name: string | null;
  animal_type: string;
  breed: string | null;
  foaled_year: number | null;
};

/**
 * Horses this person owns.
 *
 * `animal_registry` is global and its read policy is `using (true)` — a horse's
 * papers are a public fact. So this MUST filter by owner: without the filter
 * the screen would list every horse on the platform, and it would look like it
 * was working.
 */
export async function listMyHorses(profileId: string): Promise<Horse[]> {
  return unwrap(
    await supabase
      .from('animal_registry')
      .select('id, barn_name, registered_name, animal_type, breed, foaled_year')
      .eq('owner_user_id', profileId)
      .is('deceased_at', null)
      .order('barn_name', { ascending: true }),
    'Could not load your horses',
  );
}

export async function addHorse(
  profileId: string,
  horse: { barnName: string; registeredName?: string; breed?: string; foaledYear?: number },
): Promise<void> {
  const { error } = await supabase.from('animal_registry').insert({
    barn_name: horse.barnName.trim(),
    registered_name: horse.registeredName?.trim() || null,
    breed: horse.breed?.trim() || null,
    foaled_year: horse.foaledYear ?? null,
    animal_type: 'horse',
    owner_user_id: profileId,
    is_claimed: true,
    claimed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not add that horse: ${error.message}`);
}

export type CareerRun = {
  id: string;
  rodeo_name: string;
  event_code: string;
  run_date: string;
  place: number | null;
  earnings_cents: number;
  final_time: number | null;
  final_score: number | null;
  source: string;
  is_verified: boolean;
};

/**
 * This person's own runs, official and self-reported together.
 *
 * `career_runs_own` scopes this to the caller, so no owner filter is needed
 * for correctness — but it is applied anyway. A policy is a backstop, not a
 * query plan, and a future policy change should not silently widen this.
 */
export async function listMyRuns(profileId: string): Promise<CareerRun[]> {
  return unwrap(
    await supabase
      .from('career_runs')
      .select(
        'id, rodeo_name, event_code, run_date, place, earnings_cents, final_time, final_score, source, is_verified',
      )
      .eq('contestant_id', profileId)
      .order('run_date', { ascending: false })
      .limit(100),
    'Could not load your runs',
  );
}

/**
 * Record a practice or off-platform run.
 *
 * Pinned to `self_reported` and `is_verified: false`, which is also what the
 * `career_runs_self_report` policy enforces. Both matter: the policy is the
 * guarantee, and this is the statement of intent next to the code that would
 * otherwise be tempted to pass something else. A hand-timed run must never be
 * able to present itself as an official result — `public_career` excludes
 * self-reported rows outright, so this is what keeps a practice time off a
 * leaderboard.
 */
export async function logPracticeRun(
  profileId: string,
  run: { rodeoName: string; runDate: string; timeSeconds: number | null; note?: string },
): Promise<void> {
  const { error } = await supabase.from('career_runs').insert({
    contestant_id: profileId,
    rodeo_name: run.rodeoName.trim() || 'Practice',
    event_code: PRIMARY_EVENT_CODE,
    run_date: run.runDate,
    final_time: run.timeSeconds,
    source: 'self_reported',
    is_verified: false,
    source_note: run.note?.trim() || 'Logged in the app',
    org_id: null,
  });
  if (error) throw new Error(`Could not log that run: ${error.message}`);
}
