
ALTER TABLE public.ad_cabinets
  ADD COLUMN IF NOT EXISTS meta_launched_campaign_id text,
  ADD COLUMN IF NOT EXISTS meta_launched_adset_id text,
  ADD COLUMN IF NOT EXISTS meta_launched_ad_id text,
  ADD COLUMN IF NOT EXISTS meta_launched_creative_id text,
  ADD COLUMN IF NOT EXISTS last_launched_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_launch_error text,
  ADD COLUMN IF NOT EXISTS launch_status text NOT NULL DEFAULT 'idle'
    CHECK (launch_status IN ('idle','launching','active','paused','error'));
