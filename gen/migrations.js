#!/usr/bin/env node
// Emits the Supabase migrations for each event app.
//
// 001 is identical everywhere: identity, safety primitives, and the AI
// analysis tables, which are event-agnostic.
// 002 is the event layer, different in every app.

const fs = require('fs');
const path = require('path');
const { APPS } = require('./apps.config.js');

const OUT_ROOT = process.env.OUT_ROOT || '/workspace/build';

const CORE = (app) => `-- =====================================================================
-- 001 — Identity, safety primitives, and run analysis
--
-- Identical across every RodeoApps event app. The event layer is 002.
--
-- Minor-safety rules live in the DATABASE, not the client, so they hold
-- regardless of which client writes. The privacy policy commits to them.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  birth_year INTEGER,
  is_youth BOOLEAN NOT NULL DEFAULT false,
  primary_role TEXT,
  privacy_level TEXT NOT NULL DEFAULT 'public'
    CHECK (privacy_level IN ('public', 'followers', 'private')),
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

-- Anyone under 18 defaults to followers-only. Enforced here rather than in
-- the signup screen so it cannot be bypassed by a different client.
CREATE OR REPLACE FUNCTION public.enforce_minor_privacy()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.birth_year IS NOT NULL
     AND (EXTRACT(YEAR FROM now())::int - NEW.birth_year) < 18 THEN
    NEW.is_youth := true;
    IF NEW.privacy_level = 'public' THEN
      NEW.privacy_level := 'followers';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_minor_privacy ON public.profiles;
CREATE TRIGGER trg_profiles_minor_privacy
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_minor_privacy();

CREATE TABLE IF NOT EXISTS public.guardian_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  minor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_sharing_allowed BOOLEAN NOT NULL DEFAULT false,
  dm_allowed BOOLEAN NOT NULL DEFAULT false,
  recruiting_visible BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guardian_id, minor_id)
);

-- Block and report are launch requirements, not phase two. App Store review
-- rejects social apps without them on user-generated content.
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'harassment', 'unwanted_contact', 'spam', 'impersonation',
    'animal_welfare', 'safety', 'other'
  )),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.association_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  association_code TEXT NOT NULL,
  member_number TEXT,
  classification JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  valid_from DATE,
  valid_to DATE,
  verified_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Rule versioning. Required at phase 0, not later.
--
-- A run must be scored under the rules in force on the day it happened,
-- forever. Recomputing a 2026 average with 2027 rules produces wrong
-- history, wrong standings and wrong money.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_code TEXT NOT NULL,
  edition_label TEXT NOT NULL,
  source_url TEXT,
  effective_from DATE NOT NULL,
  effective_to DATE,
  revision_date DATE,
  superseded_by UUID REFERENCES public.rule_sets(id),
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.rule_set_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES public.rule_sets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  value JSONB NOT NULL,
  citation TEXT,
  amended_on DATE,
  UNIQUE (rule_set_id, event_type, rule_key)
);

CREATE TABLE IF NOT EXISTS public.rule_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES public.rule_sets(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  changed_on DATE NOT NULL DEFAULT current_date,
  source_note TEXT
);

-- Resolve by effective date, never by "current".
CREATE OR REPLACE FUNCTION public.rules_for(
  p_association TEXT, p_event TEXT, p_on DATE
) RETURNS TABLE (rule_key TEXT, value JSONB, citation TEXT)
LANGUAGE sql STABLE AS $$
  SELECT e.rule_key, e.value, e.citation
  FROM public.rule_sets s
  JOIN public.rule_set_entries e ON e.rule_set_id = s.id
  WHERE s.association_code = p_association
    AND e.event_type = p_event
    AND s.effective_from <= p_on
    AND (s.effective_to IS NULL OR s.effective_to >= p_on)
  ORDER BY s.effective_from DESC;
$$;

-- ---------------------------------------------------------------------
-- Run analysis. The walk-around benchmark and everything measured from it.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.benchmark_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  animal_id UUID,
  capture_method TEXT NOT NULL CHECK (capture_method IN ('orbit', 'turntable')),
  coverage_degrees NUMERIC CHECK (coverage_degrees BETWEEN 0 AND 360),
  frame_count INTEGER,
  duration_ms INTEGER,
  quality_score NUMERIC CHECK (quality_score BETWEEN 0 AND 1),
  quality_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','rejected')),
  video_url TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rider_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capture_id UUID REFERENCES public.benchmark_captures(id) ON DELETE SET NULL,
  embedding NUMERIC[] NOT NULL,
  measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_count INTEGER NOT NULL DEFAULT 1,
  sample_variance NUMERIC,
  confidence NUMERIC CHECK (confidence BETWEEN 0 AND 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rider_baselines_one_active
  ON public.rider_baselines(user_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.run_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id UUID,
  rider_baseline_id UUID REFERENCES public.rider_baselines(id) ON DELETE SET NULL,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  segments JSONB NOT NULL DEFAULT '{}'::jsonb,
  key_moments JSONB NOT NULL DEFAULT '[]'::jsonb,
  engine_version TEXT NOT NULL,
  pose_model TEXT,
  confidence NUMERIC CHECK (confidence BETWEEN 0 AND 1),
  analysed_on_device BOOLEAN NOT NULL DEFAULT true,
  analysed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stable codes, because the coach-side tally counts how many contestants
-- share a fault and that only means something if it is named identically
-- every time.
CREATE TABLE IF NOT EXISTS public.run_faults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id UUID NOT NULL REFERENCES public.run_measurements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  segment TEXT NOT NULL,
  attributed_to TEXT NOT NULL CHECK (attributed_to IN ('rider','horse','pair')),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  measured_value NUMERIC,
  baseline_value NUMERIC,
  deviation NUMERIC,
  t_ms INTEGER,
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_faults_code ON public.run_faults(code);
CREATE INDEX IF NOT EXISTS idx_run_measurements_user ON public.run_measurements(user_id);

-- =====================================================================
-- ROW LEVEL SECURITY — on every table, no exceptions
-- =====================================================================

ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_links          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.association_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_sets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_set_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_change_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_captures      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_baselines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_measurements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_faults              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles readable by visibility" ON public.profiles;
CREATE POLICY "Profiles readable by visibility" ON public.profiles FOR SELECT
  USING (
    privacy_level = 'public'
    OR id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.guardian_links g
      WHERE g.minor_id = profiles.id AND g.guardian_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users write own profile" ON public.profiles;
CREATE POLICY "Users write own profile" ON public.profiles FOR ALL
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Guardian links visible to both parties" ON public.guardian_links;
CREATE POLICY "Guardian links visible to both parties" ON public.guardian_links FOR SELECT
  USING (guardian_id = auth.uid() OR minor_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own blocks" ON public.blocks;
CREATE POLICY "Users manage own blocks" ON public.blocks FOR ALL
  USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users file own reports" ON public.reports;
CREATE POLICY "Users file own reports" ON public.reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Users read own reports" ON public.reports;
CREATE POLICY "Users read own reports" ON public.reports FOR SELECT
  USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own memberships" ON public.association_memberships;
CREATE POLICY "Users manage own memberships" ON public.association_memberships FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Rule sets are reference data: everyone reads, nobody writes from a client.
DROP POLICY IF EXISTS "Rule sets are readable" ON public.rule_sets;
CREATE POLICY "Rule sets are readable" ON public.rule_sets FOR SELECT USING (true);
DROP POLICY IF EXISTS "Rule entries are readable" ON public.rule_set_entries;
CREATE POLICY "Rule entries are readable" ON public.rule_set_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Rule changes are readable" ON public.rule_change_log;
CREATE POLICY "Rule changes are readable" ON public.rule_change_log FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users manage own captures" ON public.benchmark_captures;
CREATE POLICY "Users manage own captures" ON public.benchmark_captures FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own baseline" ON public.rider_baselines;
CREATE POLICY "Users manage own baseline" ON public.rider_baselines FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own measurements" ON public.run_measurements;
CREATE POLICY "Users manage own measurements" ON public.run_measurements FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own faults" ON public.run_faults;
CREATE POLICY "Users manage own faults" ON public.run_faults FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
`;

const EVENT_LAYER = {
  br: `-- 002 — Breakaway roping event layer

CREATE TABLE IF NOT EXISTS public.horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barn_name TEXT NOT NULL,
  registered_name TEXT,
  registry TEXT,
  registration_number TEXT,
  sex TEXT,
  foaling_year INTEGER,
  br_role TEXT CHECK (br_role IN ('breakaway','calf','both','prospect')),
  run_style TEXT CHECK (run_style IN ('runs_hard','rates','reads_calf')),
  scores_well BOOLEAN,
  stop_rating INTEGER CHECK (stop_rating BETWEEN 1 AND 10),
  honest_in_box BOOLEAN,
  suited_to TEXT CHECK (suited_to IN ('pro','jackpot','youth','beginner')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.br_calves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id UUID,
  tag TEXT,
  weight_lb INTEGER,
  speed_rating INTEGER,
  duck_flag BOOLEAN NOT NULL DEFAULT false,
  stop_flag BOOLEAN NOT NULL DEFAULT false,
  run_straight_rating INTEGER,
  times_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.br_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  horse_id UUID REFERENCES public.horses(id) ON DELETE SET NULL,
  calf_id UUID REFERENCES public.br_calves(id) ON DELETE SET NULL,
  rule_set_id UUID REFERENCES public.rule_sets(id),
  raw_time_ms INTEGER,
  official_time_ms INTEGER,
  catch_type TEXT CHECK (catch_type IN
    ('bell_collar','leg_in_loop','half_head','horn','figure_eight','no_catch')),
  barrier_broken BOOLEAN NOT NULL DEFAULT false,
  loops_thrown INTEGER NOT NULL DEFAULT 1,
  string_broke BOOLEAN,
  status TEXT NOT NULL DEFAULT 'clean',
  score_line_ft INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deliberately a SEPARATE table from br_runs. Practice data is the daily-use
-- hook; official results are the credibility. Merging them destroys the
-- credibility, and a hand-timed run must never reach a leaderboard.
CREATE TABLE IF NOT EXISTS public.br_practice_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  horse_id UUID REFERENCES public.horses(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hand_timed_ms INTEGER,
  catch_type TEXT,
  notes TEXT,
  is_official BOOLEAN NOT NULL DEFAULT false CHECK (is_official = false)
);

CREATE TABLE IF NOT EXISTS public.br_equipment_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.br_runs(id) ON DELETE SET NULL,
  string_gauge TEXT,
  knot_count INTEGER,
  flag_color TEXT,
  flag_size_in INTEGER,
  photo_url TEXT,
  -- Derived from WPRA 12.10.9, never supplied by the client.
  passed BOOLEAN GENERATED ALWAYS AS (
    knot_count >= 3 AND flag_size_in >= 12
  ) STORED,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.horses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.br_calves            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.br_runs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.br_practice_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.br_equipment_checks  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own horses" ON public.horses;
CREATE POLICY "Users manage own horses" ON public.horses FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Calves are readable" ON public.br_calves;
CREATE POLICY "Calves are readable" ON public.br_calves FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage own runs" ON public.br_runs;
CREATE POLICY "Users manage own runs" ON public.br_runs FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users manage own practice runs" ON public.br_practice_runs;
CREATE POLICY "Users manage own practice runs" ON public.br_practice_runs FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users manage own equipment checks" ON public.br_equipment_checks;
CREATE POLICY "Users manage own equipment checks" ON public.br_equipment_checks FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
`,

  td: `-- 002 — Tie-down roping event layer

CREATE TABLE IF NOT EXISTS public.horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barn_name TEXT NOT NULL,
  registered_name TEXT,
  registry TEXT,
  registration_number TEXT,
  sex TEXT,
  foaling_year INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.td_calves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id UUID,
  tag TEXT,
  weight_lb INTEGER,
  speed_rating INTEGER,
  stop_flag BOOLEAN NOT NULL DEFAULT false,
  duck_flag BOOLEAN NOT NULL DEFAULT false,
  kick_rating INTEGER,
  times_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.td_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  horse_id UUID REFERENCES public.horses(id) ON DELETE SET NULL,
  calf_id UUID REFERENCES public.td_calves(id) ON DELETE SET NULL,
  rule_set_id UUID REFERENCES public.rule_sets(id),
  raw_time_ms INTEGER,
  official_time_ms INTEGER,
  catch_ok BOOLEAN,
  calf_thrown_by_hand BOOLEAN,
  legs_tied INTEGER,
  wrap_and_hooey BOOLEAN,
  tie_held BOOLEAN,
  barrier_broken BOOLEAN NOT NULL DEFAULT false,
  loops_thrown INTEGER NOT NULL DEFAULT 1,
  jerk_down BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'clean',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The segment model is the schema that makes this app worth paying for.
CREATE TABLE IF NOT EXISTS public.tie_down_segments (
  run_id UUID PRIMARY KEY REFERENCES public.td_runs(id) ON DELETE CASCADE,
  barrier_break_ms INTEGER,
  leave_box_ms INTEGER,
  catch_ms INTEGER,
  slack_pulled_ms INTEGER,
  dismount_ms INTEGER,
  down_the_rope_ms INTEGER,
  flank_ms INTEGER,
  string_on_ms INTEGER,
  tie_complete_ms INTEGER,
  remount_ms INTEGER,
  horse_step_ms INTEGER,
  judge_approve_ms INTEGER,
  segment_source TEXT NOT NULL DEFAULT 'ai'
    CHECK (segment_source IN ('ai','manual','imported'))
);

-- Public, dimension-by-dimension calf horse ratings. Also the backbone of the
-- marketplace: a horse with an accumulated rating history across riders is
-- worth more and sells faster.
CREATE TABLE IF NOT EXISTS public.td_horse_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id UUID NOT NULL REFERENCES public.horses(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score_out_of_box INTEGER CHECK (score_out_of_box BETWEEN 1 AND 10),
  rate INTEGER CHECK (rate BETWEEN 1 AND 10),
  stop INTEGER CHECK (stop BETWEEN 1 AND 10),
  works_rope INTEGER CHECK (works_rope BETWEEN 1 AND 10),
  quiet_in_box INTEGER CHECK (quiet_in_box BETWEEN 1 AND 10),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (horse_id, rater_id)
);

CREATE TABLE IF NOT EXISTS public.piggin_strings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand TEXT,
  material TEXT,
  length_in INTEGER,
  runs_count INTEGER NOT NULL DEFAULT 0,
  retired_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.td_practice_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  horse_id UUID REFERENCES public.horses(id) ON DELETE SET NULL,
  hand_timed_ms INTEGER,
  segments JSONB,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_official BOOLEAN NOT NULL DEFAULT false CHECK (is_official = false)
);

ALTER TABLE public.horses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.td_calves         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.td_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tie_down_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.td_horse_ratings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piggin_strings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.td_practice_runs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own horses" ON public.horses;
CREATE POLICY "Users manage own horses" ON public.horses FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Calves are readable" ON public.td_calves;
CREATE POLICY "Calves are readable" ON public.td_calves FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage own runs" ON public.td_runs;
CREATE POLICY "Users manage own runs" ON public.td_runs FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Segments follow the run" ON public.tie_down_segments;
CREATE POLICY "Segments follow the run" ON public.tie_down_segments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.td_runs r
                 WHERE r.id = tie_down_segments.run_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "Horse ratings are public" ON public.td_horse_ratings;
CREATE POLICY "Horse ratings are public" ON public.td_horse_ratings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users write own ratings" ON public.td_horse_ratings;
CREATE POLICY "Users write own ratings" ON public.td_horse_ratings FOR INSERT
  WITH CHECK (rater_id = auth.uid());
DROP POLICY IF EXISTS "Users manage own strings" ON public.piggin_strings;
CREATE POLICY "Users manage own strings" ON public.piggin_strings FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users manage own practice" ON public.td_practice_runs;
CREATE POLICY "Users manage own practice" ON public.td_practice_runs FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
`,

  tr: `-- 002 — Team roping event layer
--
-- Everything singular in the other apps is a pair here. The handicap number
-- is the organising principle of the sport, so classification gets first-
-- class treatment rather than living in a profile JSON blob.

CREATE TABLE IF NOT EXISTS public.horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barn_name TEXT NOT NULL,
  registered_name TEXT,
  tr_role TEXT CHECK (tr_role IN ('head','heel','both','prospect')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- numeric(3,1) and never an integer: half numbers have been the industry
-- norm since the WSTR moved to an 18-point scale in 2010.
CREATE TABLE IF NOT EXISTS public.tr_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  association_code TEXT NOT NULL DEFAULT 'USTRC',
  -- A roper can hold a different number on each end. Two nullable columns,
  -- deliberately not one.
  header_number NUMERIC(3,1) CHECK (header_number BETWEEN 1 AND 9),
  heeler_number NUMERIC(3,1) CHECK (heeler_number BETWEEN 1 AND 10),
  elite BOOLEAN NOT NULL DEFAULT false,
  effective_from DATE NOT NULL DEFAULT current_date,
  effective_to DATE,
  source TEXT,
  UNIQUE (user_id, association_code, effective_from)
);

-- Floors and caps change by season, so they are rows rather than code.
CREATE TABLE IF NOT EXISTS public.tr_division_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_code TEXT NOT NULL,
  season INTEGER NOT NULL,
  division INTEGER NOT NULL,
  cap NUMERIC(3,1),
  floor_header_at_least NUMERIC(3,1),
  floor_heeler_at_least NUMERIC(3,1),
  elite_cap NUMERIC(3,1),
  UNIQUE (association_code, season, division)
);

CREATE TABLE IF NOT EXISTS public.tr_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  header_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  heeler_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Frozen at entry. A number moving mid-season must not retroactively
  -- change what division a team was eligible for.
  classification_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tr_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.tr_teams(id) ON DELETE CASCADE,
  rule_set_id UUID REFERENCES public.rule_sets(id),
  raw_time_ms INTEGER,
  official_time_ms INTEGER,
  head_catch TEXT CHECK (head_catch IN
    ('both_horns','half_head','neck','horn_hondo_cross','crossed_loop','bridle','leg','no_catch')),
  heel_catch TEXT CHECK (heel_catch IN ('two_feet','one_foot','front_foot','no_catch')),
  barrier_broken BOOLEAN NOT NULL DEFAULT false,
  crossfire BOOLEAN NOT NULL DEFAULT false,
  heeler_tied_on BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'clean',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partner finding is the highest-value feature in the app, so availability
-- is a real table rather than a free-text note on a profile.
CREATE TABLE IF NOT EXISTS public.tr_partner_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  end_preference TEXT NOT NULL CHECK (end_preference IN ('header','heeler','both')),
  available_from DATE,
  available_to DATE,
  travel_radius_mi INTEGER,
  home_region TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.horses                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tr_classifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tr_division_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tr_teams                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tr_runs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tr_partner_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own horses" ON public.horses;
CREATE POLICY "Users manage own horses" ON public.horses FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- Numbers are public. The whole social system runs on knowing them.
DROP POLICY IF EXISTS "Classifications are public" ON public.tr_classifications;
CREATE POLICY "Classifications are public" ON public.tr_classifications FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users write own classification" ON public.tr_classifications;
CREATE POLICY "Users write own classification" ON public.tr_classifications FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Division rules are readable" ON public.tr_division_rules;
CREATE POLICY "Division rules are readable" ON public.tr_division_rules FOR SELECT USING (true);
DROP POLICY IF EXISTS "Team members read their team" ON public.tr_teams;
CREATE POLICY "Team members read their team" ON public.tr_teams FOR SELECT
  USING (header_id = auth.uid() OR heeler_id = auth.uid());
DROP POLICY IF EXISTS "Team members write their team" ON public.tr_teams;
CREATE POLICY "Team members write their team" ON public.tr_teams FOR INSERT
  WITH CHECK (header_id = auth.uid() OR heeler_id = auth.uid());
DROP POLICY IF EXISTS "Team members read runs" ON public.tr_runs;
CREATE POLICY "Team members read runs" ON public.tr_runs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tr_teams t WHERE t.id = tr_runs.team_id
                 AND (t.header_id = auth.uid() OR t.heeler_id = auth.uid())));
DROP POLICY IF EXISTS "Availability is public" ON public.tr_partner_availability;
CREATE POLICY "Availability is public" ON public.tr_partner_availability FOR SELECT USING (active);
DROP POLICY IF EXISTS "Users manage own availability" ON public.tr_partner_availability;
CREATE POLICY "Users manage own availability" ON public.tr_partner_availability FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
`,

  sw: `-- 002 — Steer wrestling event layer
--
-- The hazer system is the differentiator: you cannot compete without one,
-- and the hazer is owed a share of what you win. The settlement ledger below
-- is not an escrow and not a payment processor — it is a record both parties
-- can see, which is what makes the after-the-rodeo argument go away.

CREATE TABLE IF NOT EXISTS public.horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barn_name TEXT NOT NULL,
  registered_name TEXT,
  sw_role TEXT CHECK (sw_role IN ('bulldogging','hazing','both','prospect')),
  shareable BOOLEAN NOT NULL DEFAULT false,
  mount_money_pct NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sw_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  horse_id UUID REFERENCES public.horses(id) ON DELETE SET NULL,
  hazer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rule_set_id UUID REFERENCES public.rule_sets(id),
  raw_time_ms INTEGER,
  official_time_ms INTEGER,
  legal_fall BOOLEAN,
  barrier_broken BOOLEAN NOT NULL DEFAULT false,
  throw_technique TEXT CHECK (throw_technique IN ('classic','wing','sling','rollover')),
  status TEXT NOT NULL DEFAULT 'clean',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hazer_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL DEFAULT true,
  horses_available INTEGER NOT NULL DEFAULT 0,
  home_region TEXT,
  travel_radius_mi INTEGER,
  rate_note TEXT,
  payout_share_pct NUMERIC(5,2) NOT NULL DEFAULT 25,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.hazer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wrestler_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hazer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name TEXT,
  performance_at TIMESTAMPTZ,
  agreed_share_pct NUMERIC(5,2) NOT NULL DEFAULT 25,
  horse_id UUID REFERENCES public.horses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','confirmed','declined','completed','no_show')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hazer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.sw_runs(id) ON DELETE CASCADE,
  wrestler_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hazer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_pct NUMERIC(5,2) NOT NULL,
  -- Integer cents. A ledger that does not balance is a ledger nobody trusts.
  amount_owed_cents INTEGER NOT NULL DEFAULT 0,
  settled BOOLEAN NOT NULL DEFAULT false,
  settled_at TIMESTAMPTZ,
  settlement_note TEXT
);

CREATE TABLE IF NOT EXISTS public.hazer_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hazer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keeps_steer_straight INTEGER CHECK (keeps_steer_straight BETWEEN 1 AND 10),
  reliability INTEGER CHECK (reliability BETWEEN 1 AND 10),
  horsepower INTEGER CHECK (horsepower BETWEEN 1 AND 10),
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hazer_id, rater_id)
);

ALTER TABLE public.horses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sw_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazer_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazer_credits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazer_ratings     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own horses" ON public.horses;
CREATE POLICY "Users manage own horses" ON public.horses FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Users manage own runs" ON public.sw_runs;
CREATE POLICY "Users manage own runs" ON public.sw_runs FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Hazer profiles are public" ON public.hazer_profiles;
CREATE POLICY "Hazer profiles are public" ON public.hazer_profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage own hazer profile" ON public.hazer_profiles;
CREATE POLICY "Users manage own hazer profile" ON public.hazer_profiles FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Both parties see the assignment and both see the ledger. That is the point.
DROP POLICY IF EXISTS "Both parties see assignments" ON public.hazer_assignments;
CREATE POLICY "Both parties see assignments" ON public.hazer_assignments FOR ALL
  USING (wrestler_id = auth.uid() OR hazer_id = auth.uid())
  WITH CHECK (wrestler_id = auth.uid() OR hazer_id = auth.uid());
DROP POLICY IF EXISTS "Both parties see credits" ON public.hazer_credits;
CREATE POLICY "Both parties see credits" ON public.hazer_credits FOR ALL
  USING (wrestler_id = auth.uid() OR hazer_id = auth.uid())
  WITH CHECK (wrestler_id = auth.uid() OR hazer_id = auth.uid());
DROP POLICY IF EXISTS "Hazer ratings are public" ON public.hazer_ratings;
CREATE POLICY "Hazer ratings are public" ON public.hazer_ratings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users write own hazer ratings" ON public.hazer_ratings;
CREATE POLICY "Users write own hazer ratings" ON public.hazer_ratings FOR INSERT
  WITH CHECK (rater_id = auth.uid());
`,

  sb: `-- 002 — Saddle bronc event layer
--
-- Half the score belongs to an animal the contestant does not own, so the
-- stock intelligence tables are the core of this app rather than a side
-- feature. The four component judge marks are always stored — a total alone
-- cannot reconstruct a protest.

CREATE TABLE IF NOT EXISTS public.bucking_horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID,
  name TEXT NOT NULL,
  brand TEXT,
  foaling_year INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bronc_patterns (
  horse_id UUID PRIMARY KEY REFERENCES public.bucking_horses(id) ON DELETE CASCADE,
  jump_frequency_hz NUMERIC(4,2),
  direction_changes_avg NUMERIC(4,2),
  drop_severity_avg NUMERIC(4,2),
  buck_off_rate NUMERIC(5,2),
  avg_horse_score NUMERIC(4,1),
  trips_recorded INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sb_rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  horse_id UUID REFERENCES public.bucking_horses(id) ON DELETE SET NULL,
  rule_set_id UUID REFERENCES public.rule_sets(id),
  qualified_ride BOOLEAN NOT NULL DEFAULT false,
  marked_out BOOLEAN,
  -- All four component marks, never just the total. Judge splits are
  -- analytically interesting and are needed to reconstruct a protest.
  judge1_rider INTEGER CHECK (judge1_rider BETWEEN 0 AND 25),
  judge1_horse INTEGER CHECK (judge1_horse BETWEEN 0 AND 25),
  judge2_rider INTEGER CHECK (judge2_rider BETWEEN 0 AND 25),
  judge2_horse INTEGER CHECK (judge2_horse BETWEEN 0 AND 25),
  official_score INTEGER GENERATED ALWAYS AS (
    COALESCE(judge1_rider,0) + COALESCE(judge1_horse,0) +
    COALESCE(judge2_rider,0) + COALESCE(judge2_horse,0)
  ) STORED,
  status TEXT NOT NULL DEFAULT 'clean',
  reride_offered BOOLEAN NOT NULL DEFAULT false,
  reride_accepted BOOLEAN,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sb_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  horse_id UUID NOT NULL REFERENCES public.bucking_horses(id) ON DELETE CASCADE,
  event_name TEXT,
  performance_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bucking_horses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bronc_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sb_rides       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sb_draws       ENABLE ROW LEVEL SECURITY;

-- Stock data is public. A rider who has drawn a horse needs to know what
-- everybody else already knows about it.
DROP POLICY IF EXISTS "Bucking horses are public" ON public.bucking_horses;
CREATE POLICY "Bucking horses are public" ON public.bucking_horses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Patterns are public" ON public.bronc_patterns;
CREATE POLICY "Patterns are public" ON public.bronc_patterns FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage own rides" ON public.sb_rides;
CREATE POLICY "Users manage own rides" ON public.sb_rides FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users manage own draws" ON public.sb_draws;
CREATE POLICY "Users manage own draws" ON public.sb_draws FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
`,

  bb: `-- 002 — Bareback riding event layer
--
-- Two things carry more weight here than anywhere else in the portfolio:
-- the rigging specification, which is enforceable at the chute, and the
-- health record, because this event ends careers.

CREATE TABLE IF NOT EXISTS public.bucking_horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID,
  name TEXT NOT NULL,
  brand TEXT,
  foaling_year INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bronc_patterns (
  horse_id UUID PRIMARY KEY REFERENCES public.bucking_horses(id) ON DELETE CASCADE,
  jump_frequency_hz NUMERIC(4,2),
  direction_changes_avg NUMERIC(4,2),
  drop_severity_avg NUMERIC(4,2),
  buck_off_rate NUMERIC(5,2),
  avg_horse_score NUMERIC(4,1),
  trips_recorded INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bb_rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  horse_id UUID REFERENCES public.bucking_horses(id) ON DELETE SET NULL,
  rule_set_id UUID REFERENCES public.rule_sets(id),
  qualified_ride BOOLEAN NOT NULL DEFAULT false,
  marked_out BOOLEAN,
  judge1_rider INTEGER CHECK (judge1_rider BETWEEN 0 AND 25),
  judge1_horse INTEGER CHECK (judge1_horse BETWEEN 0 AND 25),
  judge2_rider INTEGER CHECK (judge2_rider BETWEEN 0 AND 25),
  judge2_horse INTEGER CHECK (judge2_horse BETWEEN 0 AND 25),
  official_score INTEGER GENERATED ALWAYS AS (
    COALESCE(judge1_rider,0) + COALESCE(judge1_horse,0) +
    COALESCE(judge2_rider,0) + COALESCE(judge2_horse,0)
  ) STORED,
  status TEXT NOT NULL DEFAULT 'clean',
  reride_offered BOOLEAN NOT NULL DEFAULT false,
  reride_accepted BOOLEAN,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The spec is precise and enforceable, so it is columns rather than a note.
CREATE TABLE IF NOT EXISTS public.bb_riggings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT,
  handhold_length_in NUMERIC(4,2),
  suede_cover_in NUMERIC(4,2),
  width_at_handhold_in NUMERIC(4,2),
  width_at_dring_in NUMERIC(4,2),
  handhold_material_legal BOOLEAN NOT NULL DEFAULT true,
  cinch_material TEXT CHECK (cinch_material IN ('mohair','hemp','other')),
  hardware_drings_only BOOLEAN NOT NULL DEFAULT true,
  -- Derived from the specification, never supplied by the client.
  passes_spec BOOLEAN GENERATED ALWAYS AS (
    handhold_length_in <= 8
    AND suede_cover_in >= 3
    AND width_at_handhold_in <= 10
    AND width_at_dring_in <= 6
    AND handhold_material_legal
    AND cinch_material IN ('mohair','hemp')
    AND hardware_drings_only
  ) STORED,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Weighted heaviest in this app. Access is restricted to the athlete alone.
CREATE TABLE IF NOT EXISTS public.bb_health_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN
    ('injury','concussion_symptom','recovery','load','prehab')),
  body_region TEXT CHECK (body_region IN
    ('elbow','shoulder','neck','back','hand','wrist','knee','hip','head','other')),
  occurred_on DATE NOT NULL,
  notes TEXT,
  -- The app records. It never clears anybody to ride.
  professional_seen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bucking_horses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bronc_patterns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bb_rides          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bb_riggings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bb_health_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bucking horses are public" ON public.bucking_horses;
CREATE POLICY "Bucking horses are public" ON public.bucking_horses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Patterns are public" ON public.bronc_patterns;
CREATE POLICY "Patterns are public" ON public.bronc_patterns FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage own rides" ON public.bb_rides;
CREATE POLICY "Users manage own rides" ON public.bb_rides FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users manage own riggings" ON public.bb_riggings;
CREATE POLICY "Users manage own riggings" ON public.bb_riggings FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Health records are the athlete's alone. No coach read, no team read.
DROP POLICY IF EXISTS "Health records are private" ON public.bb_health_records;
CREATE POLICY "Health records are private" ON public.bb_health_records FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
`,

  rr: `-- 002 — Ranch rodeo event layer
--
-- The only team-scored app in the portfolio. Points scales vary by producer
-- and are configuration, not code: two published presets ship, plus a custom
-- table builder, because ranch rodeo producers each have their own
-- arithmetic and will not change it for an app.

CREATE TABLE IF NOT EXISTS public.horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barn_name TEXT NOT NULL,
  ranch_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rr_ranches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  state TEXT,
  -- Required to enter any WRCA sanctioned ranch rodeo. Card verification at
  -- entry is the gate, not a nice-to-have.
  wrca_team_card TEXT,
  card_valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rr_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranch_id UUID NOT NULL REFERENCES public.rr_ranches(id) ON DELETE CASCADE,
  event_name TEXT,
  season INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rr_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.rr_teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  is_alternate BOOLEAN NOT NULL DEFAULT false,
  -- Once an original participant is replaced by an alternate, that
  -- participant cannot return to the competition.
  replaced_by UUID REFERENCES public.rr_team_members(id),
  retired_from_competition BOOLEAN NOT NULL DEFAULT false,
  roles JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (team_id, display_name)
);

CREATE TABLE IF NOT EXISTS public.rr_event_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.rr_teams(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN
    ('ranch_bronc','stray_gathering','wild_cow_milking','team_branding',
     'number_sorting','doctoring','team_penning','trailer_loading','wild_horse_race')),
  round INTEGER NOT NULL DEFAULT 1,
  raw_time_ms INTEGER,
  official_time_ms INTEGER,
  score INTEGER,
  penalty_seconds INTEGER NOT NULL DEFAULT 0,
  no_time BOOLEAN NOT NULL DEFAULT false,
  place INTEGER,
  points NUMERIC(6,2) NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rr_points_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id UUID,
  name TEXT NOT NULL,
  scale_type TEXT NOT NULL CHECK (scale_type IN
    ('descending_from_team_count','fixed_table')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  bonus_all_events INTEGER NOT NULL DEFAULT 10,
  tiebreakers JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_preset BOOLEAN NOT NULL DEFAULT false
);

-- The two published scales, shipped as presets.
INSERT INTO public.rr_points_scales (name, scale_type, config, is_preset)
VALUES
  ('WRCA sanctioned', 'descending_from_team_count',
   '{"start":"team_count"}'::jsonb, true),
  ('Texas Ranch Round-Up', 'fixed_table',
   '{"table":{"1":10,"2":7,"3":5,"4":3,"5":1}}'::jsonb, true)
ON CONFLICT DO NOTHING;

ALTER TABLE public.horses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rr_ranches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rr_teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rr_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rr_event_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rr_points_scales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own horses" ON public.horses;
CREATE POLICY "Users manage own horses" ON public.horses FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Ranches are public" ON public.rr_ranches;
CREATE POLICY "Ranches are public" ON public.rr_ranches FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners manage ranches" ON public.rr_ranches;
CREATE POLICY "Owners manage ranches" ON public.rr_ranches FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Teams are public" ON public.rr_teams;
CREATE POLICY "Teams are public" ON public.rr_teams FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ranch owners manage teams" ON public.rr_teams;
CREATE POLICY "Ranch owners manage teams" ON public.rr_teams FOR ALL
  USING (EXISTS (SELECT 1 FROM public.rr_ranches r
                 WHERE r.id = rr_teams.ranch_id AND r.owner_id = auth.uid()));
DROP POLICY IF EXISTS "Rosters are public" ON public.rr_team_members;
CREATE POLICY "Rosters are public" ON public.rr_team_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ranch owners manage rosters" ON public.rr_team_members;
CREATE POLICY "Ranch owners manage rosters" ON public.rr_team_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.rr_teams t
                 JOIN public.rr_ranches r ON r.id = t.ranch_id
                 WHERE t.id = rr_team_members.team_id AND r.owner_id = auth.uid()));
-- Results are public the moment they post. That is the product.
DROP POLICY IF EXISTS "Results are public" ON public.rr_event_runs;
CREATE POLICY "Results are public" ON public.rr_event_runs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Points scales are readable" ON public.rr_points_scales;
CREATE POLICY "Points scales are readable" ON public.rr_points_scales FOR SELECT USING (true);
`,
};

for (const app of APPS) {
  const dir = path.join(OUT_ROOT, app.repo, 'supabase', 'migrations');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '001_core_identity_and_analysis.sql'), CORE(app));
  fs.writeFileSync(
    path.join(dir, `002_${app.event}_event_layer.sql`),
    EVENT_LAYER[app.key],
  );
  console.log(`migrations for ${app.repo}`);
}
