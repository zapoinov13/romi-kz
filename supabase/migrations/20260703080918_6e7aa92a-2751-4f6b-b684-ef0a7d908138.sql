
-- Explicit column-level REVOKE for sensitive credential columns
REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM PUBLIC, anon, authenticated;
REVOKE SELECT (access_token) ON public.meta_tokens FROM PUBLIC, anon, authenticated;
REVOKE SELECT (bot_token) ON public.project_ads_telegram_bots FROM PUBLIC, anon, authenticated;
REVOKE SELECT (bot_token) ON public.project_telegram_bots FROM PUBLIC, anon, authenticated;
REVOKE SELECT (api_key_encrypted) ON public.content_factory_provider_keys FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (page_access_token) ON public.instagram_accounts FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (access_token) ON public.meta_tokens FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (bot_token) ON public.project_ads_telegram_bots FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (bot_token) ON public.project_telegram_bots FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (api_key_encrypted) ON public.content_factory_provider_keys FROM PUBLIC, anon, authenticated;

-- Presence flags (safe boolean for clients)
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS page_access_token_present boolean
  GENERATED ALWAYS AS (page_access_token IS NOT NULL AND length(page_access_token) > 0) STORED;
ALTER TABLE public.meta_tokens
  ADD COLUMN IF NOT EXISTS access_token_present boolean
  GENERATED ALWAYS AS (access_token IS NOT NULL AND length(access_token) > 0) STORED;
ALTER TABLE public.project_ads_telegram_bots
  ADD COLUMN IF NOT EXISTS bot_token_present boolean
  GENERATED ALWAYS AS (bot_token IS NOT NULL AND length(bot_token) > 0) STORED;
ALTER TABLE public.project_telegram_bots
  ADD COLUMN IF NOT EXISTS bot_token_present boolean
  GENERATED ALWAYS AS (bot_token IS NOT NULL AND length(bot_token) > 0) STORED;
ALTER TABLE public.content_factory_provider_keys
  ADD COLUMN IF NOT EXISTS api_key_present boolean
  GENERATED ALWAYS AS (api_key_encrypted IS NOT NULL AND length(api_key_encrypted) > 0) STORED;

-- Fix SECURITY DEFINER trigger function callable by anon
REVOKE EXECUTE ON FUNCTION public.sync_sales_analytics_from_lead() FROM PUBLIC, anon, authenticated;

-- Pin search_path on remaining mutable function
ALTER FUNCTION public.build_sales_source_label(text, jsonb, text, text, text) SET search_path = public;
