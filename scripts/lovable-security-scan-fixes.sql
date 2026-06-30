-- ROMI-KZ · Lovable → Supabase → SQL Editor (вставить целиком, Run)
-- Исправляет 10 пунктов Security Scan. Безопасно запускать повторно.


-- Lovable security scan fixes (idempotent). Re-apply safe column grants + storage policies.

-- =====================================================================
-- 1. ad_cabinets — hide Meta secrets from client SELECT
-- =====================================================================
DROP POLICY IF EXISTS "ad_cabinets_select_authed" ON public.ad_cabinets;

DROP POLICY IF EXISTS "ad_cabinets_select_members" ON public.ad_cabinets;
CREATE POLICY "ad_cabinets_select_members" ON public.ad_cabinets
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_can_access_project(project_id)
  );

ALTER TABLE public.ad_cabinets
  ADD COLUMN IF NOT EXISTS access_token_present boolean
  GENERATED ALWAYS AS (access_token IS NOT NULL AND length(access_token) > 0) STORED;

REVOKE SELECT (access_token, app_id, business_id) ON public.ad_cabinets FROM PUBLIC, authenticated, anon;

REVOKE SELECT ON public.ad_cabinets FROM authenticated, anon;
GRANT SELECT (
  id, project_id, name, external_id, online, type, spend, leads, lead_cost, sales, revenue,
  created_by, created_at, updated_at, ad_account_id, page_id, pixel_id, campaign_objective,
  optimization_goal, lead_form_id, daily_budget, currency, start_time, end_time, days_of_week,
  timezone, auto_launch_enabled, launch_hour, target_geo, target_age_min, target_age_max,
  target_gender, target_languages, target_interests, target_exclusions, creative_headline,
  creative_primary_text, creative_description, creative_cta, creative_media_urls, landing_url,
  utm_template, brief, city, page_name, instagram_id, telegram_group_id, whatsapp_number,
  pixel_event, website_url, provider, meta_launched_campaign_id, meta_launched_adset_id,
  meta_launched_ad_id, meta_launched_creative_id, last_launched_at, last_launch_error,
  launch_status, access_token_present, config
) ON public.ad_cabinets TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ad_cabinets TO authenticated;
GRANT ALL ON public.ad_cabinets TO service_role;

-- =====================================================================
-- 2. meta_tokens — creators must not read raw access_token
-- =====================================================================
DROP POLICY IF EXISTS "Users manage own meta_tokens" ON public.meta_tokens;

DROP POLICY IF EXISTS "Admins manage meta_tokens" ON public.meta_tokens;
CREATE POLICY "Admins manage meta_tokens" ON public.meta_tokens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users read own meta_tokens metadata" ON public.meta_tokens
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users insert own meta_tokens" ON public.meta_tokens
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users update own meta_tokens" ON public.meta_tokens
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users delete own meta_tokens" ON public.meta_tokens
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

REVOKE SELECT (access_token) ON public.meta_tokens FROM PUBLIC, authenticated, anon;
REVOKE SELECT ON public.meta_tokens FROM authenticated, anon;
GRANT SELECT (
  id, label, fb_user_id, fb_user_name, created_by, created_at, updated_at,
  token_expires_at, scopes, source
) ON public.meta_tokens TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.meta_tokens TO authenticated;
GRANT ALL ON public.meta_tokens TO service_role;

-- =====================================================================
-- 3. instagram_accounts — page_access_token hidden
-- =====================================================================
REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM PUBLIC, authenticated, anon;

ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS page_token_present boolean
  GENERATED ALWAYS AS (page_access_token IS NOT NULL AND length(page_access_token) > 0) STORED;

REVOKE SELECT ON public.instagram_accounts FROM authenticated, anon;
GRANT SELECT (
  id, project_id, ig_user_id, username, name, profile_picture_url, page_id, page_name,
  followers_count, follows_count, media_count, active, last_sync_at, last_error,
  created_at, updated_at, page_token_present
) ON public.instagram_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.instagram_accounts TO authenticated;
GRANT ALL ON public.instagram_accounts TO service_role;

-- =====================================================================
-- 4. Telegram bots — bot_token hidden (save via edge functions)
-- =====================================================================
ALTER TABLE public.project_ads_telegram_bots
  ADD COLUMN IF NOT EXISTS bot_token_present boolean
  GENERATED ALWAYS AS (bot_token IS NOT NULL AND length(bot_token) > 0) STORED;

ALTER TABLE public.project_telegram_bots
  ADD COLUMN IF NOT EXISTS bot_token_present boolean
  GENERATED ALWAYS AS (bot_token IS NOT NULL AND length(bot_token) > 0) STORED;

REVOKE SELECT (bot_token) ON public.project_ads_telegram_bots FROM PUBLIC, authenticated, anon;
REVOKE UPDATE (bot_token) ON public.project_ads_telegram_bots FROM PUBLIC, authenticated, anon;
REVOKE SELECT (bot_token) ON public.project_telegram_bots FROM PUBLIC, authenticated, anon;
REVOKE UPDATE (bot_token) ON public.project_telegram_bots FROM PUBLIC, authenticated, anon;

REVOKE SELECT ON public.project_ads_telegram_bots FROM authenticated, anon;
GRANT SELECT (
  id, project_id, bot_username, chat_id, chat_title, allowed_chat_ids, default_cabinet_id,
  default_destination, default_goal, default_daily_budget, default_country, default_city,
  is_active, last_test_at, last_test_ok, last_test_error, created_by, created_at, updated_at,
  default_geo, default_age_min, default_age_max, default_gender, default_objective,
  default_placements, bot_token_present
) ON public.project_ads_telegram_bots TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.project_ads_telegram_bots TO authenticated;
GRANT ALL ON public.project_ads_telegram_bots TO service_role;

REVOKE SELECT ON public.project_telegram_bots FROM authenticated, anon;
GRANT SELECT (
  id, project_id, bot_username, chat_id, chat_title, is_active, last_test_at, last_test_ok,
  last_test_error, created_by, created_at, updated_at, bot_token_present
) ON public.project_telegram_bots TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.project_telegram_bots TO authenticated;
GRANT ALL ON public.project_telegram_bots TO service_role;

-- =====================================================================
-- 5. whatsapp_config — tokens only via RPC bind_whatsapp_to_project
-- =====================================================================
REVOKE SELECT (api_token, webhook_token) ON public.whatsapp_config FROM PUBLIC, authenticated, anon;
REVOKE UPDATE (api_token, webhook_token) ON public.whatsapp_config FROM PUBLIC, authenticated, anon;

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS api_token_present boolean
  GENERATED ALWAYS AS (api_token IS NOT NULL AND length(api_token) > 0) STORED,
  ADD COLUMN IF NOT EXISTS webhook_token_present boolean
  GENERATED ALWAYS AS (webhook_token IS NOT NULL AND length(webhook_token) > 0) STORED;

REVOKE SELECT ON public.whatsapp_config FROM authenticated, anon;
GRANT SELECT (
  id, user_id, project_id, id_instance, api_url, connected, phone, display_name,
  connected_at, updated_at, ads_only, webhook_url, bot_webhook_url,
  api_token_present, webhook_token_present
) ON public.whatsapp_config TO authenticated;
GRANT INSERT, DELETE ON public.whatsapp_config TO authenticated;
GRANT UPDATE (
  connected, phone, display_name, connected_at, ads_only, webhook_url, bot_webhook_url,
  id_instance, api_url
) ON public.whatsapp_config TO authenticated;
GRANT ALL ON public.whatsapp_config TO service_role;

-- =====================================================================
-- 6. content_factory_provider_keys — encrypted key not readable
-- =====================================================================
DROP POLICY IF EXISTS "members read provider keys" ON public.content_factory_provider_keys;
DROP POLICY IF EXISTS "admins read provider keys" ON public.content_factory_provider_keys;

CREATE POLICY "members read provider key metadata" ON public.content_factory_provider_keys
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_can_access_project(project_id)
  );

REVOKE SELECT (api_key_encrypted) ON public.content_factory_provider_keys FROM PUBLIC, authenticated, anon;
REVOKE UPDATE (api_key_encrypted) ON public.content_factory_provider_keys FROM PUBLIC, authenticated, anon;

REVOKE SELECT ON public.content_factory_provider_keys FROM authenticated, anon;
GRANT SELECT (
  id, project_id, provider, key_hint, priority, is_enabled, status, last_checked_at,
  last_error, balance_info, created_by, created_at, updated_at
) ON public.content_factory_provider_keys TO authenticated;
GRANT UPDATE (
  provider, key_hint, priority, is_enabled, status, last_checked_at, last_error, balance_info
) ON public.content_factory_provider_keys TO authenticated;
GRANT INSERT, DELETE ON public.content_factory_provider_keys TO authenticated;
GRANT ALL ON public.content_factory_provider_keys TO service_role;

-- =====================================================================
-- 7. automation_settings — verify meta token column grant
-- =====================================================================
REVOKE SELECT (sipuni_token, meta_access_token, cron_secret) ON public.automation_settings FROM PUBLIC, authenticated, anon;
REVOKE UPDATE (sipuni_token, meta_access_token, cron_secret) ON public.automation_settings FROM PUBLIC, authenticated, anon;

ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS meta_access_token_present boolean
  GENERATED ALWAYS AS (meta_access_token IS NOT NULL AND length(meta_access_token) > 0) STORED,
  ADD COLUMN IF NOT EXISTS sipuni_token_present boolean
  GENERATED ALWAYS AS (sipuni_token IS NOT NULL AND length(sipuni_token) > 0) STORED;

REVOKE SELECT ON public.automation_settings FROM authenticated, anon;
GRANT SELECT (
  id, followup_2h_enabled, followup_2h_minutes, auto_msg_24h_enabled, auto_msg_24h_hours,
  auto_msg_24h_template_key, revival_7d_enabled, revival_7d_days, revival_7d_template_key,
  updated_at, telephony_provider, sipuni_user, sipuni_operator, sipuni_enabled,
  sipuni_token_present, meta_access_token_present
) ON public.automation_settings TO authenticated;
GRANT UPDATE (
  followup_2h_enabled, followup_2h_minutes, auto_msg_24h_enabled, auto_msg_24h_hours,
  auto_msg_24h_template_key, revival_7d_enabled, revival_7d_days, revival_7d_template_key,
  telephony_provider, sipuni_user, sipuni_operator, sipuni_enabled
) ON public.automation_settings TO authenticated;
GRANT ALL ON public.automation_settings TO service_role;

-- =====================================================================
-- 8. Storage: content-factory-generated — explicit write policies
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-factory-generated', 'content-factory-generated', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "content_factory_generated_member_read" ON storage.objects;
CREATE POLICY "content_factory_generated_member_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-factory-generated'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        (storage.foldername(name))[1] IS NOT NULL
        AND public.user_can_access_project(((storage.foldername(name))[1])::uuid)
      )
    )
  );

DROP POLICY IF EXISTS "content_factory_generated_member_insert" ON storage.objects;
CREATE POLICY "content_factory_generated_member_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-factory-generated'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        (storage.foldername(name))[1] IS NOT NULL
        AND public.user_can_access_project(((storage.foldername(name))[1])::uuid)
      )
    )
  );

DROP POLICY IF EXISTS "content_factory_generated_member_update" ON storage.objects;
CREATE POLICY "content_factory_generated_member_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-factory-generated'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        (storage.foldername(name))[1] IS NOT NULL
        AND public.user_can_access_project(((storage.foldername(name))[1])::uuid)
      )
    )
  )
  WITH CHECK (
    bucket_id = 'content-factory-generated'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        (storage.foldername(name))[1] IS NOT NULL
        AND public.user_can_access_project(((storage.foldername(name))[1])::uuid)
      )
    )
  );

DROP POLICY IF EXISTS "content_factory_generated_member_delete" ON storage.objects;
CREATE POLICY "content_factory_generated_member_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-factory-generated'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        (storage.foldername(name))[1] IS NOT NULL
        AND public.user_can_access_project(((storage.foldername(name))[1])::uuid)
      )
    )
  );

-- =====================================================================
-- 9. Function search_path — pin public schema
-- =====================================================================
ALTER FUNCTION public.sync_ad_cabinet_meta_columns() SET search_path = public;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT p.prosecdef
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search_path=%'
        )
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;
