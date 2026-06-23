ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS campaign_name text,
  ADD COLUMN IF NOT EXISTS adset_name    text,
  ADD COLUMN IF NOT EXISTS ad_name       text,
  ADD COLUMN IF NOT EXISTS headline      text,
  ADD COLUMN IF NOT EXISTS description   text,
  ADD COLUMN IF NOT EXISTS cta           text;