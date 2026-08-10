-- =====================================================================
-- 010 — Run analysis (walk-around benchmark and measured runs)
--
-- Breakaway already has identity, safety primitives and rule versioning
-- applied from migrations 001-006, so this file adds ONLY the analysis
-- layer. Numbered 010 to stay clear of 003-006, which are live in the
-- database but not yet in this repo — run `supabase db pull` before
-- applying anything new. See STATUS.md.
-- =====================================================================

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

ALTER TABLE public.benchmark_captures      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_baselines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_measurements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_faults              ENABLE ROW LEVEL SECURITY;

  USING (
    privacy_level = 'public'
    OR id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.guardian_links g
      WHERE g.minor_id = profiles.id AND g.guardian_id = auth.uid()
    )
  );

  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

  USING (guardian_id = auth.uid() OR minor_id = auth.uid());

  USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

  WITH CHECK (reporter_id = auth.uid());

  USING (reporter_id = auth.uid());

  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Rule sets are reference data: everyone reads, nobody writes from a client.

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