-- Security Scan Critical/Warning fixes (Lovable). Idempotent.

-- =====================================================================
-- 1. automation_settings_safe — NEVER expose raw secrets (was leaking cron_secret to admins)
-- =====================================================================
DROP VIEW IF EXISTS public.automation_settings_safe;
CREATE VIEW public.automation_settings_safe
WITH (security_invoker = true) AS
SELECT
  id,
  followup_2h_enabled,
  followup_2h_minutes,
  auto_msg_24h_enabled,
  auto_msg_24h_hours,
  auto_msg_24h_template_key,
  revival_7d_enabled,
  revival_7d_days,
  revival_7d_template_key,
  telephony_provider,
  sipuni_enabled,
  sipuni_user,
  sipuni_operator,
  updated_at,
  meta_access_token_present,
  sipuni_token_present,
  cron_secret_present
FROM public.automation_settings;

GRANT SELECT ON public.automation_settings_safe TO authenticated;

-- =====================================================================
-- 2. ad_cabinets_safe — project members, no secrets
-- =====================================================================
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
WHERE
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.user_can_access_project(project_id);

GRANT SELECT ON public.ad_cabinets_safe TO authenticated;

-- =====================================================================
-- 3. meta_tokens — admin write-only on base table; metadata SELECT only
-- =====================================================================
DROP POLICY IF EXISTS "Admins manage meta_tokens" ON public.meta_tokens;
DROP POLICY IF EXISTS "Users manage own meta_tokens" ON public.meta_tokens;

DROP POLICY IF EXISTS "Users read own meta_tokens metadata" ON public.meta_tokens;
CREATE POLICY "Users read own meta_tokens metadata" ON public.meta_tokens
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Admins read meta_tokens metadata" ON public.meta_tokens;
CREATE POLICY "Admins read meta_tokens metadata" ON public.meta_tokens
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users insert own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users insert own meta_tokens" ON public.meta_tokens
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users update own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users update own meta_tokens" ON public.meta_tokens
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users delete own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users delete own meta_tokens" ON public.meta_tokens
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Admins delete meta_tokens" ON public.meta_tokens;
CREATE POLICY "Admins delete meta_tokens" ON public.meta_tokens
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- =====================================================================
-- 4. profiles — admins see team without phone; own phone via RPC
-- =====================================================================
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_team" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_select_team" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE SELECT (phone, sip_extension) ON public.profiles FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'name', name,
    'phone', phone,
    'sip_extension', sip_extension
  )
  FROM public.profiles
  WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;

-- =====================================================================
-- 5. creative-posters storage — project-scoped read (not all authenticated)
-- =====================================================================
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

-- =====================================================================
-- 6. Re-apply column lockdown + cron_secret
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.ad_cabinets') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.ad_cabinets'::regclass, ARRAY['access_token','app_id','business_id']);
  END IF;
  IF to_regclass('public.meta_tokens') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.meta_tokens'::regclass, ARRAY['access_token']);
  END IF;
  IF to_regclass('public.instagram_accounts') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.instagram_accounts'::regclass, ARRAY['page_access_token']);
  END IF;
  IF to_regclass('public.project_ads_telegram_bots') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.project_ads_telegram_bots'::regclass, ARRAY['bot_token']);
  END IF;
  IF to_regclass('public.project_telegram_bots') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.project_telegram_bots'::regclass, ARRAY['bot_token']);
  END IF;
  IF to_regclass('public.whatsapp_config') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.whatsapp_config'::regclass, ARRAY['api_token','webhook_token']);
  END IF;
  IF to_regclass('public.content_factory_provider_keys') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.content_factory_provider_keys'::regclass, ARRAY['api_key_encrypted']);
  END IF;
  IF to_regclass('public.automation_settings') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.automation_settings'::regclass, ARRAY['meta_access_token','sipuni_token','cron_secret']);
  END IF;
  IF to_regclass('public.projects') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.projects'::regclass, ARRAY['intake_token']);
  END IF;
  IF to_regclass('public.profiles') IS NOT NULL THEN
    PERFORM public._grant_safe_select('public.profiles'::regclass, ARRAY['phone','sip_extension']);
  END IF;
END $$;

UPDATE public.automation_settings
   SET cron_secret = encode(gen_random_bytes(32), 'hex'),
       updated_at = now()
 WHERE id = true
   AND (cron_secret IS NULL OR btrim(cron_secret) = '');
