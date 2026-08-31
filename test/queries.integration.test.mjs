// test/queries.integration.test.mjs
//
// The app's data layer, over real HTTP.
//
// Everything else verified in this repo is either static (typecheck, the
// schema guard) or server-side (RLS proven directly in Postgres). What none of
// it covers is the part in between: does supabase-js, driven by the shipping
// `queries.ts`, actually construct a request the server would accept, and does
// it parse the answer correctly?
//
// The egress policy blocks the real Supabase host, so this runs against a
// strict local double instead. Localhost is not proxied. That is not the same
// as hitting production — it cannot prove RLS, and it does not exercise auth —
// but it does exercise every line of `queries.ts` through a real socket, and
// it catches the failures that only appear at runtime: a malformed filter, a
// wrong operator, an `.in()` that serialises badly, an error branch that
// throws the wrong thing.
//
// The double refuses unknown columns the way PostgREST does, so a typo fails
// here loudly rather than being echoed back as success.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { startPostgrestDouble } from './postgrest-double.mjs';

const SCHEMA = {
  rodeos:
    'allow_online_entry,contact_email,contact_name,contact_phone,created_at,description,end_date,entry_close_date,entry_open_date,ground_rules,has_short_go,has_slack,id,max_entries_per_event,name,num_go_rounds,num_performances,org_id,payment_methods,refund_policy,rodeo_type,slug,start_date,status,template_id,timezone,total_added_money,updated_at,venue_address,venue_city,venue_country,venue_lat,venue_lng,venue_name,venue_state'.split(','),
  rodeo_events:
    'added_money,additional_entry_fee,arena_length_feet,arena_width_feet,books_close_at,books_open_at,created_at,d_format_config,division_config,drag_every_n_runs,draw_method,entry_fee,entry_methods,event_type,ground_rules,has_short_go,id,is_d_format,is_roughstock,max_entries_per_contestant,min_entries_to_hold,num_go_rounds,org_id,payout_config_id,payout_structure,rodeo_id,score_line_feet,scoring_config_id,scoring_mode,short_go_count,sort_order,status,stock_charge,updated_at'.split(','),
  users:
    'address_line1,address_line2,city,country,created_at,date_of_birth,email,first_name,id,last_name,memberships,phone,postal_code,state_province,stripe_account_id,stripe_customer_id,stripe_payouts_enabled,supabase_auth_id,tax_id_last4,tax_id_type,tax_id_verified,updated_at'.split(','),
  animal_registry:
    'animal_type,barn_name,breed,claimed_at,color,created_at,created_by_org,dam_id,deceased_at,foaled_year,id,is_claimed,owner_user_id,registered_name,registrations,retired_at,sex,sire_id,updated_at'.split(','),
  career_runs:
    'animal_id,association_code,contestant_id,created_at,d_division,earnings_cents,event_code,final_score,final_time,go_round,id,is_verified,org_id,place,points,result_type,rodeo_event_id,rodeo_id,rodeo_name,run_date,source,source_note,updated_at,venue_city,venue_state'.split(','),
  entries:
    'buddy_group_id,combined_number,confirmed_at,contestant_id,created_at,division_name,draw_position,drawn_at,entered_at,entry_fee_amount,entry_slot,entry_type,fees_paid,go_round_number,header_number,heeler_number,horse_id,id,notes,org_id,partner_id,payment_id,performance_number,procom_confirmation,release_type,rodeo_event_id,rodeo_id,status,turnout_notified_at,updated_at'.split(','),
  stock_draws:
    'animal_id,created_at,entry_id,go_round,id,is_redraw,org_id,original_draw_id,performance,redraw_reason,rodeo_event_id,rodeo_id'.split(','),
  notices:
    'attempts,body,channel,created_at,email,entity_id,entity_type,id,last_error,notice_type,org_id,payload,phone,rodeo_id,send_after,sent_at,status,subject,updated_at,user_id'.split(','),
  public_results:
    'aggregate_score,contestant_id,d_division,end_date,event_sort_order,event_type,first_name,go_round,last_name,org_id,payout_amount,place,points_earned,result_type,rodeo_event_id,rodeo_id,rodeo_name,rodeo_slug,start_date,tied_with,venue_city,venue_state'.split(','),
  public_standings:
    'contestant_id,event_type,first_name,last_name,rodeos_entered,sanctioning_body,season,total_earnings,total_points'.split(','),
  waiver_templates:
    'applies_to_roles,body_text,created_at,id,is_active,name,org_id,required_by,requires_notary,version,waiver_type'.split(','),
  signed_waivers:
    'consent_to_electronic,created_at,guardian_name,guardian_user_id,id,ip_address,org_id,pdf_url,record_hash,recorded_by,rodeo_id,signature_image_url,signature_method,signed_at,typed_name,user_agent,user_id,waiver_template_id,waiver_text_hash,waiver_version'.split(','),
};

const RODEO = {
  id: 'r1',
  org_id: 'o1',
  name: 'Smoke Rodeo',
  slug: 'smoke',
  start_date: '2026-09-12',
  end_date: '2026-09-14',
  venue_name: 'County Arena',
  venue_city: 'Stephenville',
  venue_state: 'TX',
  venue_lat: 32.22,
  venue_lng: -98.2,
  status: 'entries_open',
  entry_close_date: '2026-09-05',
  total_added_money: 2500,
  allow_online_entry: true,
  contact_name: 'Secretary',
  contact_phone: '555-0100',
  contact_email: 'sec@example.invalid',
};

describe('queries.ts over HTTP', () => {
  let server;
  let queries;

  let EVENT_CODE;
  let EVENT_CODES;

  before(async () => {
    // Read from this app's own theme rather than hardcoded, because the same
    // harness ships in all seven repos and each one is about a different
    // event. Hardcoding tie_down_roping here would make six of them fail for
    // the wrong reason.
    const theme = await import('../src/constants/theme.ts');
    EVENT_CODES = theme.app.eventCodes;
    EVENT_CODE = EVENT_CODES[0];

    server = await startPostgrestDouble({
      schema: SCHEMA,
      rows: {
        rodeos: [RODEO],
        rodeo_events: [
          {
            id: 'e1',
            event_type: undefined, // filled in below, once the theme is read
            scoring_mode: 'timed',
            entry_fee: 125,
            added_money: 500,
            num_go_rounds: 1,
            ground_rules: null,
            score_line_feet: 20,
            status: 'scheduled',
          },
        ],
        users: [
          {
            id: 'u1',
            first_name: 'Casey',
            last_name: 'Roper',
            email: 'casey@example.invalid',
            phone: null,
            city: 'Weatherford',
            state_province: 'TX',
            memberships: [],
          },
        ],
        career_runs: [],
        entries: [],
        stock_draws: [],
        notices: [],
        public_results: [],
        public_standings: [],
        animal_registry: [],
      },
    });

    // The client reads these at import time, so they must be set first.
    process.env.EXPO_PUBLIC_SUPABASE_URL = server.url;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

    // The fixture has to answer with the event this app actually asks for.
    server.setRows('rodeo_events', [
      {
        id: 'e1',
        event_type: EVENT_CODE,
        scoring_mode: 'timed',
        entry_fee: 125,
        added_money: 500,
        num_go_rounds: 1,
        ground_rules: null,
        score_line_feet: 20,
        status: 'scheduled',
      },
    ]);

    queries = await import('../src/lib/queries.ts');
  });

  after(async () => {
    await server.close();
  });

  test('listUpcomingRodeos asks the server for real columns and parses the answer', async () => {
    const rodeos = await queries.listUpcomingRodeos();

    assert.equal(rodeos.length, 1);
    assert.equal(rodeos[0].name, 'Smoke Rodeo');
    // The org id is what the entry flow needs; it was missing from the first
    // version of this select and nothing would have noticed until entry failed.
    assert.equal(rodeos[0].org_id, 'o1');

    const request = server.requests.at(-1);
    assert.equal(request.table, 'rodeos');
    assert.match(request.params.status, /entries_open/);
    // Only rodeos that have not finished.
    assert.ok(request.params.end_date?.startsWith('gte.'));
  });

  test('getEventForRodeo filters to this app’s event codes', async () => {
    const event = await queries.getEventForRodeo('r1');
    assert.equal(event.event_type, EVENT_CODE);

    const request = server.requests.at(-1);
    // The bug this pins: `app.eventType` is the app slug ("tiedown") and
    // matches no row in reference_options. It has to be the database code, and
    // every code the app claims must appear in the filter — a heeler who only
    // saw team_roping_header rows would think they were not entered.
    for (const code of EVENT_CODES) {
      assert.match(request.params.event_type, new RegExp(code));
    }
  });

  test('a PostgREST error is thrown, not returned as an empty list', async () => {
    // The branch that matters most in `unwrap`. If a 400 came back as `[]`, the
    // screen would render "No rodeos yet" over a server error — an answer that
    // reads as a fact rather than a failure, and the most misleading thing an
    // arena app can do.
    server.failWith('rodeos', 400, {
      code: '42703',
      message: 'column rodeos.nonsense does not exist',
    });

    await assert.rejects(
      () => queries.listUpcomingRodeos(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Could not load rodeos/);
        assert.match(error.message, /does not exist/);
        return true;
      },
    );

    server.failWith(null);
  });

  test('getMyProfile returns null rather than throwing when there is no row', async () => {
    // An account created before the provisioning trigger existed has no
    // profile. That is recoverable in one tap, so it must not surface as a red
    // error screen.
    server.setRows('users', []);
    const profile = await queries.getMyProfile('auth-with-no-profile');
    assert.equal(profile, null);

    server.setRows('users', [
      {
        id: 'u1',
        first_name: 'Casey',
        last_name: 'Roper',
        email: 'casey@example.invalid',
        phone: null,
        city: 'Weatherford',
        state_province: 'TX',
        memberships: [],
      },
    ]);
  });

  test('logPracticeRun can never write anything but a self-reported run', async () => {
    await queries.logPracticeRun('u1', {
      rodeoName: 'Home arena',
      runDate: '2026-08-30',
      timeSeconds: 8.4,
    });

    const request = server.requests.at(-1);
    assert.equal(request.method, 'POST');
    assert.equal(request.table, 'career_runs');
    // Three separate places enforce this; the client is one of them.
    assert.equal(request.body.source, 'self_reported');
    assert.equal(request.body.is_verified, false);
    assert.equal(request.body.org_id, null);
    assert.equal(request.body.event_code, EVENT_CODE);
  });

  test('enterRodeoEvent creates a pending, unpaid entry', async () => {
    await queries.enterRodeoEvent('u1', {
      orgId: 'o1',
      rodeoId: 'r1',
      rodeoEventId: 'e1',
      entryFee: 125,
    });

    const request = server.requests.at(-1);
    assert.equal(request.table, 'entries');
    assert.equal(request.body.contestant_id, 'u1');
    assert.equal(request.body.entry_fee_amount, 125);
    // Neither may be set here: an entry is confirmed when the producer takes
    // the money, and Stripe is not wired.
    assert.equal(request.body.status, undefined);
    assert.equal(request.body.fees_paid, undefined);
  });

  test('listMyPartnerEntries builds a valid two-sided filter', async () => {
    await queries.listMyPartnerEntries('u1');
    const request = server.requests.at(-1);
    // `.or()` is the easiest thing in PostgREST to get syntactically wrong,
    // and a malformed one is a 400 rather than a silent miss.
    assert.match(request.params.or, /contestant_id\.eq\.u1/);
    assert.match(request.params.or, /partner_id\.eq\.u1/);
    assert.ok(request.params['partner_id'].startsWith('not.is.'));
  });

  test('listStandings restricts to this app’s events', async () => {
    await queries.listStandings();
    const request = server.requests.at(-1);
    assert.equal(request.table, 'public_standings');
    assert.match(request.params.event_type, new RegExp(EVENT_CODE));
  });
});
