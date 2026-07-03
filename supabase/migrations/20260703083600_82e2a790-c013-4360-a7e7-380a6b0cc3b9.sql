
-- 1) ad_cabinets.access_token
REVOKE SELECT (access_token), UPDATE (access_token) ON public.ad_cabinets FROM PUBLIC, anon, authenticated;

-- 2) meta_tokens.access_token
REVOKE SELECT (access_token), UPDATE (access_token) ON public.meta_tokens FROM PUBLIC, anon, authenticated;

-- 3) instagram_accounts.page_access_token
REVOKE SELECT (page_access_token), UPDATE (page_access_token) ON public.instagram_accounts FROM PUBLIC, anon, authenticated;

-- 4) project_ads_telegram_bots.bot_token
REVOKE SELECT (bot_token), UPDATE (bot_token) ON public.project_ads_telegram_bots FROM PUBLIC, anon, authenticated;

-- 5) project_telegram_bots.bot_token
REVOKE SELECT (bot_token), UPDATE (bot_token) ON public.project_telegram_bots FROM PUBLIC, anon, authenticated;

-- 6) content_factory_provider_keys.api_key_encrypted
REVOKE SELECT (api_key_encrypted), UPDATE (api_key_encrypted) ON public.content_factory_provider_keys FROM PUBLIC, anon, authenticated;

-- 7) automation_settings raw secrets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_settings' AND column_name='meta_access_token') THEN
    EXECUTE 'REVOKE SELECT (meta_access_token), UPDATE (meta_access_token) ON public.automation_settings FROM PUBLIC, anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_settings' AND column_name='sipuni_token') THEN
    EXECUTE 'REVOKE SELECT (sipuni_token), UPDATE (sipuni_token) ON public.automation_settings FROM PUBLIC, anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_settings' AND column_name='cron_secret') THEN
    EXECUTE 'REVOKE SELECT (cron_secret), UPDATE (cron_secret) ON public.automation_settings FROM PUBLIC, anon, authenticated';
  END IF;

  -- Presence flags for admins to check without reading secrets
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_settings' AND column_name='meta_access_token_present') THEN
    EXECUTE 'ALTER TABLE public.automation_settings ADD COLUMN meta_access_token_present boolean GENERATED ALWAYS AS (COALESCE(length(btrim(meta_access_token)), 0) > 0) STORED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_settings' AND column_name='sipuni_token_present') THEN
    EXECUTE 'ALTER TABLE public.automation_settings ADD COLUMN sipuni_token_present boolean GENERATED ALWAYS AS (COALESCE(length(btrim(sipuni_token)), 0) > 0) STORED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_settings' AND column_name='cron_secret_present') THEN
    EXECUTE 'ALTER TABLE public.automation_settings ADD COLUMN cron_secret_present boolean GENERATED ALWAYS AS (COALESCE(length(btrim(cron_secret)), 0) > 0) STORED';
  END IF;
END $$;

-- 8) projects.intake_token
REVOKE SELECT (intake_token), UPDATE (intake_token) ON public.projects FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='intake_token_present') THEN
    EXECUTE 'ALTER TABLE public.projects ADD COLUMN intake_token_present boolean GENERATED ALWAYS AS (COALESCE(length(btrim(intake_token)), 0) > 0) STORED';
  END IF;
END $$;

-- Helper: fetch intake_token only for admins or project owners (SECURITY DEFINER, no anon)
CREATE OR REPLACE FUNCTION public.get_project_intake_token(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_token text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT intake_token INTO v_token FROM public.projects WHERE id = p_project_id;
  RETURN v_token;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_project_intake_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_intake_token(uuid) TO authenticated;

-- Ensure service_role retains full access everywhere
GRANT ALL ON public.ad_cabinets, public.meta_tokens, public.instagram_accounts,
              public.project_ads_telegram_bots, public.project_telegram_bots,
              public.content_factory_provider_keys, public.automation_settings, public.projects
  TO service_role;
