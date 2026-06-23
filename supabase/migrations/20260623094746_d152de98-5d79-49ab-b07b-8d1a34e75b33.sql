
-- =====================================================================
-- 1. SECURITY DEFINER function lockdown
-- =====================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Re-grant EXECUTE only to roles that actually need it.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_module(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_viewer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_project(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.bind_whatsapp_to_project(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_whatsapp_bot_webhook(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cabinet_health_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_lead_attribution(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_cdi_for_project(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_creative_funnel(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meta_structure_sync(date, date, uuid) TO authenticated;

-- Public intake form needs to resolve project by token without sign-in
GRANT EXECUTE ON FUNCTION public.resolve_intake_project(text) TO anon, authenticated;

-- =====================================================================
-- 2. ad_cabinets: add member SELECT policy + hide access_token
-- =====================================================================
DROP POLICY IF EXISTS "ad_cabinets_select_members" ON public.ad_cabinets;
CREATE POLICY "ad_cabinets_select_members" ON public.ad_cabinets
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_can_access_project(project_id)
  );

REVOKE SELECT ON public.ad_cabinets FROM authenticated, anon;
GRANT SELECT (
  id, project_id, name, external_id, online, type, spend, leads, lead_cost,
  sales, revenue, created_by, created_at, updated_at, app_id, ad_account_id,
  page_id, pixel_id, business_id, campaign_objective, optimization_goal,
  lead_form_id, daily_budget, currency, start_time, end_time, days_of_week,
  timezone, auto_launch_enabled, launch_hour, target_geo, target_age_min,
  target_age_max, target_gender, target_languages, target_interests,
  target_exclusions, creative_headline, creative_primary_text,
  creative_description, creative_cta, creative_media_urls, landing_url,
  utm_template, brief, city, page_name, instagram_id, telegram_group_id,
  whatsapp_number, pixel_event, website_url, provider,
  meta_launched_campaign_id, meta_launched_adset_id, meta_launched_ad_id,
  meta_launched_creative_id, last_launched_at, last_launch_error, launch_status
) ON public.ad_cabinets TO authenticated;

-- =====================================================================
-- 3. automation_settings: hide credential columns from authenticated
-- =====================================================================
REVOKE SELECT ON public.automation_settings FROM authenticated, anon;
GRANT SELECT (
  id, followup_2h_enabled, followup_2h_minutes, auto_msg_24h_enabled,
  auto_msg_24h_hours, auto_msg_24h_template_key, revival_7d_enabled,
  revival_7d_days, revival_7d_template_key, updated_at, telephony_provider,
  sipuni_user, sipuni_operator, sipuni_enabled, sipuni_token_present
) ON public.automation_settings TO authenticated;

-- =====================================================================
-- 4. content_factory_provider_keys: admin/creator-only read, hide key
-- =====================================================================
DROP POLICY IF EXISTS "members read provider keys" ON public.content_factory_provider_keys;
CREATE POLICY "admins read provider keys" ON public.content_factory_provider_keys
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR created_by = auth.uid()
  );

REVOKE SELECT ON public.content_factory_provider_keys FROM authenticated, anon;
GRANT SELECT (
  id, project_id, provider, key_hint, priority, is_enabled, status,
  last_checked_at, last_error, balance_info, created_by, created_at, updated_at
) ON public.content_factory_provider_keys TO authenticated;

-- =====================================================================
-- 5. instagram_accounts: hide page_access_token
-- =====================================================================
REVOKE SELECT ON public.instagram_accounts FROM authenticated, anon;
GRANT SELECT (
  id, project_id, ig_user_id, username, name, profile_picture_url,
  page_id, page_name, followers_count, follows_count, media_count,
  active, last_sync_at, last_error, created_at, updated_at
) ON public.instagram_accounts TO authenticated;

-- =====================================================================
-- 6. meta_tokens: hide access_token from authenticated
-- =====================================================================
REVOKE SELECT ON public.meta_tokens FROM authenticated, anon;
GRANT SELECT (
  id, label, fb_user_id, fb_user_name, created_by, created_at, updated_at
) ON public.meta_tokens TO authenticated;

-- =====================================================================
-- 7. project_ads_telegram_bots: hide bot_token
-- =====================================================================
REVOKE SELECT ON public.project_ads_telegram_bots FROM authenticated, anon;
GRANT SELECT (
  id, project_id, bot_username, chat_id, chat_title, allowed_chat_ids,
  default_cabinet_id, default_destination, default_goal, default_daily_budget,
  default_country, default_city, is_active, last_test_at, last_test_ok,
  last_test_error, created_by, created_at, updated_at,
  default_geo, default_age_min, default_age_max, default_gender,
  default_objective, default_placements
) ON public.project_ads_telegram_bots TO authenticated;

-- =====================================================================
-- 8. project_telegram_bots: hide bot_token
-- =====================================================================
REVOKE SELECT ON public.project_telegram_bots FROM authenticated, anon;
GRANT SELECT (
  id, project_id, bot_username, chat_id, chat_title, is_active,
  last_test_at, last_test_ok, last_test_error,
  created_by, created_at, updated_at
) ON public.project_telegram_bots TO authenticated;

-- =====================================================================
-- 9. whatsapp_config: hide api_token / webhook_token
-- =====================================================================
REVOKE SELECT ON public.whatsapp_config FROM authenticated, anon;
GRANT SELECT (
  id, user_id, project_id, id_instance, api_url, connected, phone,
  display_name, connected_at, updated_at, ads_only, webhook_url,
  bot_webhook_url, api_token_present, webhook_token_present
) ON public.whatsapp_config TO authenticated;

-- =====================================================================
-- 10. Storage: add explicit SELECT policies for the two flagged buckets
-- =====================================================================
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

DROP POLICY IF EXISTS "creative_posters_public_read" ON storage.objects;
CREATE POLICY "creative_posters_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'creative-posters');
