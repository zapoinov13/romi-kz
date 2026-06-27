
ALTER TABLE public.ad_kpi_targets
  ADD COLUMN IF NOT EXISTS auto_duplicate_adset_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_duplicate_stable_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS auto_duplicate_max_cpl numeric,
  ADD COLUMN IF NOT EXISTS auto_duplicate_min_leads integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS auto_smart_pause_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_pause_spend_threshold numeric,
  ADD COLUMN IF NOT EXISTS auto_pause_min_ctr_pct numeric,
  ADD COLUMN IF NOT EXISTS auto_pause_max_cpm numeric,
  ADD COLUMN IF NOT EXISTS auto_pause_scope text NOT NULL DEFAULT 'adset';
