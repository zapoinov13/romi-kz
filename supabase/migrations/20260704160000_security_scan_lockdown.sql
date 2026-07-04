-- Security scan lockdown: secret columns never readable/writable from client roles.
-- Idempotent. service_role keeps full access (bypasses grants).

-- =====================================================================
-- Helper: grant SELECT only on non-secret columns
-- =====================================================================
CREATE OR REPLACE FUNCTION public._grant_safe_select(p_table regclass, p_secrets text[])
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cols text;
  tbl text := p_table::text;
BEGIN
  tbl := regexp_replace(tbl, '^public\.', '');
  tbl := trim(both '"' from tbl);

  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = tbl
    AND NOT (c.column_name = ANY (p_secrets));

  IF cols IS NULL OR cols = '' THEN
    RAISE NOTICE 'no safe columns for %', tbl;
    RETURN;
  END IF;

  EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC, anon, authenticated', tbl);
  EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, tbl);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._grant_safe_select(regclass, text[]) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- Presence flags (safe to expose)
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ad_cabinets')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ad_cabinets' AND column_name='access_token_present') THEN
    ALTER TABLE public.ad_cabinets
      ADD COLUMN access_token_present boolean
      GENERATED ALWAYS AS (access_token IS NOT NULL AND length(access_token) > 0) STORED;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='instagram_accounts')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='instagram_accounts' AND column_name='page_token_present') THEN
    ALTER TABLE public.instagram_accounts
      ADD COLUMN page_token_present boolean
      GENERATED ALWAYS AS (page_access_token IS NOT NULL AND length(page_access_token) > 0) STORED;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='project_ads_telegram_bots')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_ads_telegram_bots' AND column_name='bot_token_present') THEN
    ALTER TABLE public.project_ads_telegram_bots
      ADD COLUMN bot_token_present boolean
      GENERATED ALWAYS AS (bot_token IS NOT NULL AND length(bot_token) > 0) STORED;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='project_telegram_bots')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_telegram_bots' AND column_name='bot_token_present') THEN
    ALTER TABLE public.project_telegram_bots
      ADD COLUMN bot_token_present boolean
      GENERATED ALWAYS AS (bot_token IS NOT NULL AND length(bot_token) > 0) STORED;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_config') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_config' AND column_name='api_token_present') THEN
      ALTER TABLE public.whatsapp_config
        ADD COLUMN api_token_present boolean
        GENERATED ALWAYS AS (api_token IS NOT NULL AND length(api_token) > 0) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_config' AND column_name='webhook_token_present') THEN
      ALTER TABLE public.whatsapp_config
        ADD COLUMN webhook_token_present boolean
        GENERATED ALWAYS AS (webhook_token IS NOT NULL AND length(webhook_token) > 0) STORED;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='content_factory_provider_keys')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='content_factory_provider_keys' AND column_name='api_key_present') THEN
    ALTER TABLE public.content_factory_provider_keys
      ADD COLUMN api_key_present boolean
      GENERATED ALWAYS AS (api_key_encrypted IS NOT NULL AND length(api_key_encrypted) > 0) STORED;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='automation_settings') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_settings' AND column_name='meta_access_token_present') THEN
      ALTER TABLE public.automation_settings
        ADD COLUMN meta_access_token_present boolean
        GENERATED ALWAYS AS (meta_access_token IS NOT NULL AND length(btrim(meta_access_token)) > 0) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_settings' AND column_name='sipuni_token_present') THEN
      ALTER TABLE public.automation_settings
        ADD COLUMN sipuni_token_present boolean
        GENERATED ALWAYS AS (sipuni_token IS NOT NULL AND length(btrim(sipuni_token)) > 0) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_settings' AND column_name='cron_secret_present') THEN
      ALTER TABLE public.automation_settings
        ADD COLUMN cron_secret_present boolean
        GENERATED ALWAYS AS (cron_secret IS NOT NULL AND length(btrim(cron_secret)) > 0) STORED;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='intake_token')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='intake_token_present') THEN
    ALTER TABLE public.projects
      ADD COLUMN intake_token_present boolean
      GENERATED ALWAYS AS (COALESCE(length(btrim(intake_token)), 0) > 0) STORED;
  END IF;
END $$;

-- =====================================================================
-- Revoke secret columns (SELECT + UPDATE) from client roles
-- =====================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ad_cabinets', 'access_token'),
      ('ad_cabinets', 'app_id'),
      ('ad_cabinets', 'business_id'),
      ('meta_tokens', 'access_token'),
      ('instagram_accounts', 'page_access_token'),
      ('project_ads_telegram_bots', 'bot_token'),
      ('project_telegram_bots', 'bot_token'),
      ('whatsapp_config', 'api_token'),
      ('whatsapp_config', 'webhook_token'),
      ('content_factory_provider_keys', 'api_key_encrypted'),
      ('automation_settings', 'meta_access_token'),
      ('automation_settings', 'sipuni_token'),
      ('automation_settings', 'cron_secret'),
      ('projects', 'intake_token')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.col
    ) THEN
      EXECUTE format(
        'REVOKE SELECT (%I), UPDATE (%I) ON public.%I FROM PUBLIC, anon, authenticated',
        r.col, r.col, r.tbl
      );
    END IF;
  END LOOP;
END $$;

-- =====================================================================
-- Re-grant SELECT only on safe columns
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.ad_cabinets') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.ad_cabinets'::regclass, ARRAY['access_token','app_id','business_id']);
    GRANT INSERT, DELETE, UPDATE ON public.ad_cabinets TO authenticated;
    REVOKE UPDATE (access_token, app_id, business_id) ON public.ad_cabinets FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.meta_tokens') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.meta_tokens'::regclass, ARRAY['access_token']);
    GRANT INSERT, DELETE, UPDATE ON public.meta_tokens TO authenticated;
    REVOKE UPDATE (access_token) ON public.meta_tokens FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.instagram_accounts') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.instagram_accounts'::regclass, ARRAY['page_access_token']);
    GRANT INSERT, DELETE, UPDATE ON public.instagram_accounts TO authenticated;
    REVOKE UPDATE (page_access_token) ON public.instagram_accounts FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.project_ads_telegram_bots') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.project_ads_telegram_bots'::regclass, ARRAY['bot_token']);
    GRANT INSERT, DELETE, UPDATE ON public.project_ads_telegram_bots TO authenticated;
    REVOKE UPDATE (bot_token) ON public.project_ads_telegram_bots FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.project_telegram_bots') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.project_telegram_bots'::regclass, ARRAY['bot_token']);
    GRANT INSERT, DELETE, UPDATE ON public.project_telegram_bots TO authenticated;
    REVOKE UPDATE (bot_token) ON public.project_telegram_bots FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.whatsapp_config') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.whatsapp_config'::regclass, ARRAY['api_token','webhook_token']);
    GRANT INSERT, DELETE, UPDATE ON public.whatsapp_config TO authenticated;
    REVOKE UPDATE (api_token, webhook_token) ON public.whatsapp_config FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.content_factory_provider_keys') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.content_factory_provider_keys'::regclass, ARRAY['api_key_encrypted']);
    GRANT INSERT, DELETE, UPDATE ON public.content_factory_provider_keys TO authenticated;
    REVOKE UPDATE (api_key_encrypted) ON public.content_factory_provider_keys FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.automation_settings') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.automation_settings'::regclass, ARRAY['meta_access_token','sipuni_token','cron_secret']);
    GRANT UPDATE ON public.automation_settings TO authenticated;
    REVOKE UPDATE (meta_access_token, sipuni_token, cron_secret) ON public.automation_settings FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.projects') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.projects'::regclass, ARRAY['intake_token']);
    GRANT UPDATE ON public.projects TO authenticated;
    REVOKE UPDATE (intake_token) ON public.projects FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- =====================================================================
-- RLS: metadata-only policies (secrets already column-revoked)
-- =====================================================================
DROP POLICY IF EXISTS "members read provider keys" ON public.content_factory_provider_keys;
DROP POLICY IF EXISTS "admins read provider keys" ON public.content_factory_provider_keys;
DROP POLICY IF EXISTS "members read provider key metadata" ON public.content_factory_provider_keys;
CREATE POLICY "members read provider key metadata" ON public.content_factory_provider_keys
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.user_can_access_project(project_id)
  );

-- =====================================================================
-- SECURITY DEFINER: strip PUBLIC/anon EXECUTE; pin search_path
-- =====================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prokind = 'f'
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Client-callable SECURITY DEFINER helpers (explicit)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_project_intake_token'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.get_project_intake_token(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_project_intake_token(uuid) TO authenticated, service_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_role'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_can_access_project'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.user_can_access_project(uuid) TO authenticated, service_role;
  END IF;
END $$;

-- Internal/trigger SECURITY DEFINER — no client execute
DO $$
DECLARE
  r record;
  fn_list text[] := ARRAY[
    'handle_new_user', 'on_lead_created', 'on_communication_inserted', 'on_deal_change',
    'update_updated_at_column', 'ensure_cdi_row', 'gen_intake_token',
    '_grant_safe_select', 'sync_ad_cabinet_meta_columns'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (fn_list)
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

GRANT ALL ON public.ad_cabinets, public.meta_tokens, public.instagram_accounts,
  public.project_ads_telegram_bots, public.project_telegram_bots,
  public.whatsapp_config, public.content_factory_provider_keys,
  public.automation_settings, public.projects
TO service_role;
