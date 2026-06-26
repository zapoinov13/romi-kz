-- Расширенные правила авто-оптимизации (дублирование adset, умная пауза)

ALTER TABLE public.ad_kpi_targets
  ADD COLUMN IF NOT EXISTS auto_duplicate_adset_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_duplicate_stable_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS auto_duplicate_max_cpl numeric(12,2),
  ADD COLUMN IF NOT EXISTS auto_duplicate_min_leads integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS auto_smart_pause_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_pause_spend_threshold numeric(12,2) DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_pause_min_ctr_pct numeric(5,3) DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS auto_pause_max_cpm numeric(12,2),
  ADD COLUMN IF NOT EXISTS auto_pause_scope text NOT NULL DEFAULT 'adset';

ALTER TABLE public.ad_auto_actions
  ADD COLUMN IF NOT EXISTS adset_id text,
  ADD COLUMN IF NOT EXISTS ad_id text,
  ADD COLUMN IF NOT EXISTS entity_name text;

DO $$ BEGIN
  ALTER TYPE public.ad_auto_action_type ADD VALUE IF NOT EXISTS 'duplicate_adset';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.ad_auto_action_type ADD VALUE IF NOT EXISTS 'pause_adset';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.ad_auto_action_type ADD VALUE IF NOT EXISTS 'pause_ad';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
