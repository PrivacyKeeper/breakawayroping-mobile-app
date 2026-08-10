-- 002 — Breakaway roping event layer

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
