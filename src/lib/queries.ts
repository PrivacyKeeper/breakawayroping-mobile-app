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
  org_id: string;
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
  /** Both are required by `entries_self_insert`, so the button needs them. */
  allow_online_entry: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
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
        'id, org_id, name, slug, start_date, end_date, venue_name, venue_city, venue_state, venue_lat, venue_lng, status, entry_close_date, total_added_money, allow_online_entry, contact_name, contact_phone, contact_email',
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
        'id, org_id, name, slug, start_date, end_date, venue_name, venue_city, venue_state, venue_lat, venue_lng, status, entry_close_date, total_added_money, allow_online_entry, contact_name, contact_phone, contact_email',
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

// ---------------------------------------------------------------------------
// Entering
// ---------------------------------------------------------------------------

export type MyEntry = {
  id: string;
  rodeo_id: string;
  rodeo_event_id: string;
  status: string;
  go_round_number: number;
  draw_position: number | null;
  performance_number: number | null;
  entry_fee_amount: number | null;
  fees_paid: boolean;
  entered_at: string;
  rodeos: {
    name: string;
    start_date: string;
    end_date: string | null;
    venue_city: string | null;
    venue_state: string | null;
    status: string;
  } | null;
};

/**
 * Everything this person is entered in, soonest first.
 *
 * Ordered by the rodeo's start date rather than when they entered, because the
 * question a contestant is asking is "what is next", not "what did I do".
 */
export async function listMyEntries(profileId: string): Promise<MyEntry[]> {
  return unwrap(
    await supabase
      .from('entries')
      .select(
        'id, rodeo_id, rodeo_event_id, status, go_round_number, draw_position, performance_number, entry_fee_amount, fees_paid, entered_at, rodeos(name, start_date, end_date, venue_city, venue_state, status)',
      )
      .eq('contestant_id', profileId)
      .order('entered_at', { ascending: false })
      .limit(100),
    'Could not load your entries',
  ) as unknown as MyEntry[];
}

/** Is this person already entered in this event? Drives the button state. */
export async function findMyEntry(
  profileId: string,
  rodeoEventId: string,
): Promise<{ id: string; status: string; draw_position: number | null } | null> {
  const rows = unwrap(
    await supabase
      .from('entries')
      .select('id, status, draw_position')
      .eq('contestant_id', profileId)
      .eq('rodeo_event_id', rodeoEventId)
      .limit(1),
    'Could not check your entry',
  );
  return rows[0] ?? null;
}

export type EnterResult = { ok: true; entryId: string } | { ok: false; message: string };

/**
 * Enter this app's event at a rodeo.
 *
 * The RLS policy `entries_self_insert` is the real gate: it requires the
 * caller to be the contestant AND the rodeo to be `entries_open` with
 * `allow_online_entry` set. Nothing here can widen that, and it is deliberately
 * not re-checked in TypeScript beyond turning the resulting error into
 * something a person can act on — two copies of an eligibility rule are two
 * rules that will eventually disagree.
 *
 * `status` is left at its default of 'pending' and `fees_paid` at false. An
 * entry is not confirmed by entering it; it is confirmed when the secretary
 * takes the money, and Stripe is not wired yet. Marking it paid here would put
 * a contestant on the draw sheet without the producer having been paid.
 */
export async function enterRodeoEvent(
  profileId: string,
  input: {
    orgId: string;
    rodeoId: string;
    rodeoEventId: string;
    entryFee: number | null;
    horseId?: string | null;
    notes?: string;
  },
): Promise<EnterResult> {
  const { data, error } = await supabase
    .from('entries')
    .insert({
      org_id: input.orgId,
      rodeo_id: input.rodeoId,
      rodeo_event_id: input.rodeoEventId,
      contestant_id: profileId,
      entry_fee_amount: input.entryFee,
      horse_id: input.horseId ?? null,
      notes: input.notes?.trim() || null,
    })
    .select('id')
    .single();

  if (error) {
    // 42501 is what RLS returns when the WITH CHECK fails, and it is by far the
    // likeliest error here. "new row violates row-level security policy" means
    // nothing to a roper standing in an arena.
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      return {
        ok: false,
        message:
          'Entries are not open for this rodeo, or this producer is not taking them online. Call the number on the rodeo page.',
      };
    }
    if (error.code === '23505') {
      return { ok: false, message: 'You are already entered in this one.' };
    }
    return { ok: false, message: `Could not enter: ${error.message}` };
  }

  return { ok: true, entryId: data.id };
}

// ---------------------------------------------------------------------------
// The draw
// ---------------------------------------------------------------------------

export type MyDraw = {
  id: string;
  go_round: number | null;
  performance: number | null;
  is_redraw: boolean;
  redraw_reason: string | null;
  entries: { rodeo_id: string; draw_position: number | null } | null;
  animals: {
    name: string;
    brand_number: string | null;
    animal_type: string;
    career_stats: Record<string, unknown> | null;
  } | null;
};

/**
 * What this person drew, wherever they are entered.
 *
 * Readable at all only since 0034: `stock_draws_member_read` was
 * org-members-only, so the message `notify_draw_posted()` sends — "the draw is
 * up" — pointed at a row the recipient could not open.
 */
export async function listMyDraws(profileId: string): Promise<MyDraw[]> {
  return unwrap(
    await supabase
      .from('stock_draws')
      .select(
        'id, go_round, performance, is_redraw, redraw_reason, entries!inner(rodeo_id, draw_position, contestant_id), animals(name, brand_number, animal_type, career_stats)',
      )
      .eq('entries.contestant_id', profileId)
      .order('go_round', { ascending: true })
      .limit(50),
    'Could not load your draw',
  ) as unknown as MyDraw[];
}

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

export type PartnerEntry = {
  id: string;
  rodeo_id: string;
  status: string;
  entered_at: string;
  header_number: number | null;
  heeler_number: number | null;
  combined_number: number | null;
  division_name: string | null;
  partner_id: string | null;
  contestant_id: string;
  rodeos: { name: string; start_date: string } | null;
};

/**
 * Everyone this person has entered with, most recent first.
 *
 * A team roper's partner history is the thing they actually track — who you
 * are drawn with, what you were entered on, and how the pair did. Both sides
 * are matched because the row is the same entry whichever end you roped.
 */
export async function listMyPartnerEntries(profileId: string): Promise<PartnerEntry[]> {
  return unwrap(
    await supabase
      .from('entries')
      .select(
        'id, rodeo_id, status, entered_at, header_number, heeler_number, combined_number, division_name, partner_id, contestant_id, rodeos(name, start_date)',
      )
      .or(`contestant_id.eq.${profileId},partner_id.eq.${profileId}`)
      .not('partner_id', 'is', null)
      .order('entered_at', { ascending: false })
      .limit(60),
    'Could not load your partners',
  ) as unknown as PartnerEntry[];
}

/**
 * Names for a set of contestant ids.
 *
 * Goes through `search_people` rather than selecting from `users`, because a
 * partner is not necessarily somebody this app can read directly — and the
 * point of that function is that it returns a name and almost nothing else.
 * Falls back silently: a partner shown as "Roping partner" is worse than a
 * screen that failed to load.
 */
export async function namesFor(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await supabase
    .from('users')
    .select('id, first_name, last_name')
    .in('id', unique);

  if (error || !data) return {};
  return Object.fromEntries(
    data.map((u) => [u.id, `${u.first_name} ${u.last_name}`.trim()]),
  );
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export type Standing = {
  contestant_id: string;
  first_name: string;
  last_name: string;
  event_type: string;
  total_points: number | null;
  total_earnings: number | null;
  rodeos_entered: number | null;
  sanctioning_body: string | null;
  season: string | null;
};

/**
 * Season standings for this app's events.
 *
 * Reads `public_standings`, which aggregates over `public_results` — the one
 * place a contestant's name crosses out of the private tables, and only for
 * official placings at a rodeo already under way.
 */
export async function listStandings(): Promise<Standing[]> {
  return unwrap(
    await supabase
      .from('public_standings')
      .select(
        'contestant_id, first_name, last_name, event_type, total_points, total_earnings, rodeos_entered, sanctioning_body, season',
      )
      .in('event_type', EVENT_CODES as string[])
      .order('total_earnings', { ascending: false, nullsFirst: false })
      .limit(100),
    'Could not load the standings',
  );
}
