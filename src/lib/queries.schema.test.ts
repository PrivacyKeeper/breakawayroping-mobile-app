// src/lib/queries.schema.test.ts
//
// Does every column this app asks for actually exist?
//
// `queries.ts` builds around twenty PostgREST `select` strings by hand. A
// single wrong column name in one of them is a 400 at runtime, on one screen,
// for every user — and nothing in TypeScript catches it, because a select
// string is just a string. Typecheck passes, the bundle builds, and the screen
// is broken.
//
// So this test parses every select string out of the source and checks each
// column against a snapshot of the real database schema. It is not a
// substitute for calling the API, but it catches the specific class of bug
// that would otherwise only appear on a device: a typo, a renamed column, or a
// column that was never there.
//
// THE SNAPSHOT HAS TO BE REFRESHED WHEN THE SCHEMA CHANGES. It was taken from
// information_schema on the live project. If a migration adds or renames a
// column, update `SCHEMA` below in the same commit — a stale snapshot turns
// this from a guard into a liar.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/** Columns per table/view, from information_schema on the live project. */
const SCHEMA: Record<string, string[]> = {
  animal_registry:
    'animal_type,barn_name,breed,claimed_at,color,created_at,created_by_org,dam_id,deceased_at,foaled_year,id,is_claimed,owner_user_id,registered_name,registrations,retired_at,sex,sire_id,updated_at'.split(','),
  animals:
    'animal_type,brand_number,breed,career_stats,color,contractor_id,created_at,dam_id,date_of_birth,health_status,id,last_vet_check,name,org_id,pesi_enrolled,registration_number,registry_id,sex,sire_id,updated_at,weight_lbs'.split(','),
  career_runs:
    'animal_id,association_code,contestant_id,created_at,d_division,earnings_cents,event_code,final_score,final_time,go_round,id,is_verified,org_id,place,points,result_type,rodeo_event_id,rodeo_id,rodeo_name,run_date,source,source_note,updated_at,venue_city,venue_state'.split(','),
  entries:
    'buddy_group_id,combined_number,confirmed_at,contestant_id,created_at,division_name,draw_position,drawn_at,entered_at,entry_fee_amount,entry_slot,entry_type,fees_paid,go_round_number,header_number,heeler_number,horse_id,id,notes,org_id,partner_id,payment_id,performance_number,procom_confirmation,release_type,rodeo_event_id,rodeo_id,status,turnout_notified_at,updated_at'.split(','),
  notices:
    'attempts,body,channel,created_at,email,entity_id,entity_type,id,last_error,notice_type,org_id,payload,phone,rodeo_id,send_after,sent_at,status,subject,updated_at,user_id'.split(','),
  public_results:
    'aggregate_score,contestant_id,d_division,end_date,event_sort_order,event_type,first_name,go_round,last_name,org_id,payout_amount,place,points_earned,result_type,rodeo_event_id,rodeo_id,rodeo_name,rodeo_slug,start_date,tied_with,venue_city,venue_state'.split(','),
  public_standings:
    'contestant_id,event_type,first_name,last_name,rodeos_entered,sanctioning_body,season,total_earnings,total_points'.split(','),
  push_tokens: 'app_slug,created_at,id,is_active,last_error,last_seen_at,platform,token,user_id'.split(','),
  rodeo_events:
    'added_money,additional_entry_fee,arena_length_feet,arena_width_feet,books_close_at,books_open_at,created_at,d_format_config,division_config,drag_every_n_runs,draw_method,entry_fee,entry_methods,event_type,ground_rules,has_short_go,id,is_d_format,is_roughstock,max_entries_per_contestant,min_entries_to_hold,num_go_rounds,org_id,payout_config_id,payout_structure,rodeo_id,score_line_feet,scoring_config_id,scoring_mode,short_go_count,sort_order,status,stock_charge,updated_at'.split(','),
  rodeos:
    'allow_online_entry,contact_email,contact_name,contact_phone,created_at,description,end_date,entry_close_date,entry_open_date,ground_rules,has_short_go,has_slack,id,max_entries_per_event,name,num_go_rounds,num_performances,org_id,payment_methods,refund_policy,rodeo_type,slug,start_date,status,template_id,timezone,total_added_money,updated_at,venue_address,venue_city,venue_country,venue_lat,venue_lng,venue_name,venue_state'.split(','),
  run_video_analyses:
    'analysis,career_run_id,contestant_id,created_at,error_message,event_code,fault_codes,frame_times_ms,frame_urls,id,model_version,overall_score,processed_at,status,tokens_used,video_duration_ms,video_url'.split(','),
  signed_waivers:
    'consent_to_electronic,created_at,guardian_name,guardian_user_id,id,ip_address,org_id,pdf_url,record_hash,recorded_by,rodeo_id,signature_image_url,signature_method,signed_at,typed_name,user_agent,user_id,waiver_template_id,waiver_text_hash,waiver_version'.split(','),
  stock_draws:
    'animal_id,created_at,entry_id,go_round,id,is_redraw,org_id,original_draw_id,performance,redraw_reason,rodeo_event_id,rodeo_id'.split(','),
  users:
    'address_line1,address_line2,city,country,created_at,date_of_birth,email,first_name,id,last_name,memberships,phone,postal_code,state_province,stripe_account_id,stripe_customer_id,stripe_payouts_enabled,supabase_auth_id,tax_id_last4,tax_id_type,tax_id_verified,updated_at'.split(','),
  waiver_templates:
    'applies_to_roles,body_text,created_at,id,is_active,name,org_id,required_by,requires_notary,version,waiver_type'.split(','),
};

/**
 * Embedded resources resolve to a different table than the one being selected
 * from, so `rodeos(name, start_date)` inside a select on `entries` has to be
 * checked against `rodeos`.
 */
const EMBED_TABLE: Record<string, string> = {
  rodeos: 'rodeos',
  animals: 'animals',
  entries: 'entries',
  horses: 'animal_registry',
};

type Selection = { table: string; columns: string[]; embeds: Selection[] };

/**
 * Parse a PostgREST select string.
 *
 * Handles the two forms this codebase uses: a flat comma list, and an embedded
 * resource `name(a, b)` — including `name!inner(a, b)`, where the hint has to
 * be stripped before the name is looked up.
 */
function parseSelect(table: string, select: string): Selection {
  const root: Selection = { table, columns: [], embeds: [] };
  let depth = 0;
  let buffer = '';
  const parts: string[] = [];

  for (const char of select) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(buffer);
      buffer = '';
      continue;
    }
    buffer += char;
  }
  if (buffer.trim()) parts.push(buffer);

  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;

    const open = part.indexOf('(');
    if (open === -1) {
      // `x:y` renames; the real column is on the right.
      const column = part.includes(':') ? part.split(':')[1]! : part;
      root.columns.push(column.trim());
      continue;
    }

    const rawName = part.slice(0, open).trim();
    const inner = part.slice(open + 1, part.lastIndexOf(')'));
    // `rodeos!inner(...)` — the hint is not part of the resource name.
    const name = rawName.split('!')[0]!.trim();
    const embedTable = EMBED_TABLE[name] ?? name;
    root.embeds.push(parseSelect(embedTable, inner));
  }

  return root;
}

function check(sel: Selection, source: string, problems: string[]) {
  const known = SCHEMA[sel.table];
  if (!known) {
    problems.push(`${source}: no schema snapshot for table "${sel.table}"`);
    return;
  }
  for (const column of sel.columns) {
    if (column === '*') continue;
    if (!known.includes(column)) {
      problems.push(`${source}: "${sel.table}" has no column "${column}"`);
    }
  }
  for (const embed of sel.embeds) check(embed, source, problems);
}

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'queries.ts'), 'utf8');

test('every selected column exists in the database', () => {
  // Matches `.from('x')` followed by the next `.select('...')`, which is the
  // shape every query in this file uses.
  const pattern = /\.from\('([a-z_]+)'\)[\s\S]{0,400}?\.select\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g;
  const problems: string[] = [];
  let found = 0;

  for (const match of source.matchAll(pattern)) {
    const table = match[1]!;
    const select = (match[2] ?? match[3] ?? match[4] ?? '').replace(/\s+/g, '');
    if (!select) continue;
    found++;
    check(parseSelect(table, select), `select on ${table}`, problems);
  }

  // A regex that silently matched nothing would make this test pass forever
  // while checking nothing at all.
  assert.ok(found >= 10, `expected to find at least 10 select statements, found ${found}`);
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});

test('every column written by an insert or update exists', () => {
  // `.insert({ ... })` and `.update({ ... })` object literals. Only top-level
  // keys are checked; a nested object is a jsonb value, not a column.
  const pattern = /\.from\('([a-z_]+)'\)\s*\.(insert|update)\(\s*\{([\s\S]*?)\n\s*\}\)/g;
  const problems: string[] = [];
  let found = 0;

  for (const match of source.matchAll(pattern)) {
    const table = match[1]!;
    const body = match[3]!;
    const known = SCHEMA[table];
    if (!known) {
      problems.push(`write on ${table}: no schema snapshot`);
      continue;
    }
    found++;
    for (const line of body.split('\n')) {
      const key = line.match(/^\s{4}([a-z_]+):/);
      if (key && !known.includes(key[1]!)) {
        problems.push(`write on "${table}": no column "${key[1]}"`);
      }
    }
  }

  assert.ok(found >= 2, `expected to find at least 2 writes, found ${found}`);
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});

test('every filtered column exists', () => {
  // `.eq('col', ...)`, `.in('col', ...)`, `.gte`, `.is`, `.not` — a filter on a
  // column that does not exist fails exactly like a bad select.
  const blocks = source.split(/\.from\('/).slice(1);
  const problems: string[] = [];

  for (const block of blocks) {
    const table = block.slice(0, block.indexOf("'"));
    const known = SCHEMA[table];
    if (!known) continue;
    // Stop at the next statement so filters are attributed to the right table.
    const scope = block.split(/\n\n/)[0] ?? block;
    for (const m of scope.matchAll(/\.(eq|neq|gt|gte|lt|lte|in|is|not)\(\s*'([a-z_.!]+)'/g)) {
      const column = m[2]!;
      // Embedded filters like `entries.contestant_id` are checked against the
      // embedded table, not this one.
      if (column.includes('.')) {
        const [embed, col] = column.split('.') as [string, string];
        const target = SCHEMA[EMBED_TABLE[embed] ?? embed];
        if (target && !target.includes(col)) {
          problems.push(`filter on "${embed}": no column "${col}"`);
        }
        continue;
      }
      if (!known.includes(column)) {
        problems.push(`filter on "${table}": no column "${column}"`);
      }
    }
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});
