
-- ============================================================
-- 1) Lock secret columns via column-level grants.
--    Strategy: revoke table-wide SELECT from authenticated,
--    then grant SELECT only on non-secret columns. RLS rules
--    remain unchanged.
-- ============================================================

-- ad_cabinets: hide access_token, app_id, business_id
REVOKE SELECT ON public.ad_cabinets FROM authenticated;
GRANT SELECT (
  id, project_id, name, external_id, online, type, spend, leads, lead_cost,
  sales, revenue, created_by, created_at, updated_at, ad_account_id, page_id,
  pixel_id, campaign_objective, optimization_goal, lead_form_id, daily_budget,
  currency, start_time, end_time, days_of_week, timezone, auto_launch_enabled,
  launch_hour, target_geo, target_age_min, target_age_max, target_gender,
  target_languages, target_interests, target_exclusions, creative_headline,
  creative_primary_text, creative_description, creative_cta, creative_media_urls,
  landing_url, utm_template, brief, city, page_name, instagram_id,
  telegram_group_id, whatsapp_number, pixel_event, website_url, provider,
  meta_launched_campaign_id, meta_launched_adset_id, meta_launched_ad_id,
  meta_launched_creative_id, last_launched_at, last_launch_error, launch_status
) ON public.ad_cabinets TO authenticated;

-- instagram_accounts: hide page_access_token
REVOKE SELECT ON public.instagram_accounts FROM authenticated;
GRANT SELECT (
  id, project_id, ig_user_id, username, name, profile_picture_url, page_id,
  page_name, followers_count, follows_count, media_count, active,
  last_sync_at, last_error, created_at, updated_at
) ON public.instagram_accounts TO authenticated;

-- project_telegram_bots: hide bot_token
REVOKE SELECT ON public.project_telegram_bots FROM authenticated;
GRANT SELECT (
  id, project_id, bot_username, chat_id, chat_title, is_active,
  last_test_at, last_test_ok, last_test_error, created_by, created_at, updated_at
) ON public.project_telegram_bots TO authenticated;

-- project_ads_telegram_bots: hide bot_token
REVOKE SELECT ON public.project_ads_telegram_bots FROM authenticated;
GRANT SELECT (
  id, project_id, bot_username, chat_id, chat_title, allowed_chat_ids,
  default_cabinet_id, default_destination, default_goal, default_daily_budget,
  default_country, default_city, is_active, last_test_at, last_test_ok,
  last_test_error, created_by, created_at, updated_at, default_geo,
  default_age_min, default_age_max, default_gender, default_objective,
  default_placements
) ON public.project_ads_telegram_bots TO authenticated;

-- whatsapp_config: hide api_token and webhook_token (clients use _present flags
-- or the whatsapp_config_safe view)
REVOKE SELECT ON public.whatsapp_config FROM authenticated;
GRANT SELECT (
  id, user_id, project_id, id_instance, api_url, phone, display_name,
  connected, connected_at, ads_only, webhook_url, bot_webhook_url,
  updated_at, api_token_present, webhook_token_present
) ON public.whatsapp_config TO authenticated;

-- content_factory_provider_keys: hide api_key_encrypted; clients only need key_hint + status
REVOKE SELECT ON public.content_factory_provider_keys FROM authenticated;
GRANT SELECT (
  id, project_id, provider, key_hint, priority, is_enabled, status,
  last_checked_at, last_error, balance_info, created_by, created_at, updated_at
) ON public.content_factory_provider_keys TO authenticated;

-- service_role always retains full table access; reassert to be safe
GRANT ALL ON public.ad_cabinets TO service_role;
GRANT ALL ON public.instagram_accounts TO service_role;
GRANT ALL ON public.project_telegram_bots TO service_role;
GRANT ALL ON public.project_ads_telegram_bots TO service_role;
GRANT ALL ON public.whatsapp_config TO service_role;
GRANT ALL ON public.content_factory_provider_keys TO service_role;

-- ============================================================
-- 2) Storage: scope creative-posters reads to project members
--    Path format is "<cabinet_id>/<ad_id>.jpg".
-- ============================================================

DROP POLICY IF EXISTS creative_posters_authenticated_read ON storage.objects;

CREATE POLICY "creative_posters_member_read"
  ON storage.objects FOR SELECT TO authenticated
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
