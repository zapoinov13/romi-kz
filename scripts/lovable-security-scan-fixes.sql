-- ROMI-KZ · Lovable → Supabase → SQL Editor → Run
-- Закрывает Critical/Warning Security Scan (токены, secrets, SECURITY DEFINER).
-- Безопасно запускать повторно.

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

-- =====================================================================
-- 7. Critical fixes (Jul 2026 scan): views, profiles, storage, cron_secret
-- =====================================================================

DROP VIEW IF EXISTS public.automation_settings_safe;
CREATE VIEW public.automation_settings_safe
WITH (security_invoker = true) AS
SELECT
  id,
  followup_2h_enabled, followup_2h_minutes,
  auto_msg_24h_enabled, auto_msg_24h_hours, auto_msg_24h_template_key,
  revival_7d_enabled, revival_7d_days, revival_7d_template_key,
  telephony_provider, sipuni_enabled, sipuni_user, sipuni_operator,
  updated_at,
  meta_access_token_present, sipuni_token_present, cron_secret_present
FROM public.automation_settings;
GRANT SELECT ON public.automation_settings_safe TO authenticated;

DROP VIEW IF EXISTS public.ad_cabinets_safe;
CREATE VIEW public.ad_cabinets_safe
WITH (security_invoker = true) AS
SELECT
  id, project_id, created_by, created_at, updated_at,
  name, external_id, online, type, provider,
  currency, daily_budget, spend, leads, lead_cost, sales, revenue,
  city, ad_account_id, page_id, page_name, instagram_id, telegram_group_id,
  whatsapp_number, pixel_id, pixel_event, website_url, landing_url, utm_template,
  brief, campaign_objective, optimization_goal, lead_form_id,
  start_time, end_time, days_of_week, timezone,
  auto_launch_enabled, launch_hour,
  target_geo, target_age_min, target_age_max, target_gender,
  target_languages, target_interests, target_exclusions,
  creative_headline, creative_primary_text, creative_description, creative_cta,
  creative_media_urls, config, access_token_present
FROM public.ad_cabinets
WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.user_can_access_project(project_id);
GRANT SELECT ON public.ad_cabinets_safe TO authenticated;

DROP POLICY IF EXISTS "Admins manage meta_tokens" ON public.meta_tokens;
DROP POLICY IF EXISTS "Users manage own meta_tokens" ON public.meta_tokens;
DROP POLICY IF EXISTS "Users read own meta_tokens metadata" ON public.meta_tokens;
CREATE POLICY "Users read own meta_tokens metadata" ON public.meta_tokens
  FOR SELECT TO authenticated USING (created_by = auth.uid());
DROP POLICY IF EXISTS "Admins read meta_tokens metadata" ON public.meta_tokens;
CREATE POLICY "Admins read meta_tokens metadata" ON public.meta_tokens
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Users insert own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users insert own meta_tokens" ON public.meta_tokens
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "Users update own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users update own meta_tokens" ON public.meta_tokens
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "Users delete own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users delete own meta_tokens" ON public.meta_tokens
  FOR DELETE TO authenticated USING (created_by = auth.uid());
DROP POLICY IF EXISTS "Admins delete meta_tokens" ON public.meta_tokens;
CREATE POLICY "Admins delete meta_tokens" ON public.meta_tokens
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_team" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_select_team" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
REVOKE SELECT (phone, sip_extension) ON public.profiles FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('name', name, 'phone', phone, 'sip_extension', sip_extension)
  FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;

DROP POLICY IF EXISTS "creative_posters_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "creative_posters_public_read" ON storage.objects;
DROP POLICY IF EXISTS "creative_posters_member_read" ON storage.objects;
CREATE POLICY "creative_posters_member_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'creative-posters'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.ad_cabinets c
        WHERE c.id::text = split_part(name, '/', 1)
          AND public.user_can_access_project(c.project_id)
      )
    )
  );

UPDATE public.automation_settings
   SET cron_secret = encode(gen_random_bytes(32), 'hex'), updated_at = now()
 WHERE id = true AND (cron_secret IS NULL OR btrim(cron_secret) = '');
