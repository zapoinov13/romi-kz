
REVOKE SELECT, UPDATE ON public.ad_cabinets FROM authenticated;
GRANT SELECT (
  id, project_id, name, external_id, online, type, spend, leads, lead_cost, sales, revenue,
  created_by, created_at, updated_at, app_id, ad_account_id, page_id, pixel_id, business_id,
  campaign_objective, optimization_goal, lead_form_id, daily_budget, currency, start_time, end_time,
  days_of_week, timezone, auto_launch_enabled, launch_hour, target_geo, target_age_min, target_age_max,
  target_gender, target_languages, target_interests, target_exclusions, creative_headline,
  creative_primary_text, creative_description, creative_cta, creative_media_urls, landing_url,
  utm_template, brief, city, page_name, instagram_id, telegram_group_id, whatsapp_number, pixel_event,
  website_url, provider, meta_launched_campaign_id, meta_launched_adset_id, meta_launched_ad_id,
  meta_launched_creative_id, last_launched_at, last_launch_error, launch_status
) ON public.ad_cabinets TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ad_cabinets TO authenticated;
GRANT ALL ON public.ad_cabinets TO service_role;

REVOKE SELECT, UPDATE ON public.instagram_accounts FROM authenticated;
GRANT SELECT (
  id, project_id, ig_user_id, username, name, profile_picture_url, page_id, page_name,
  followers_count, follows_count, media_count, active, last_sync_at, last_error, created_at, updated_at
) ON public.instagram_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.instagram_accounts TO authenticated;
GRANT ALL ON public.instagram_accounts TO service_role;

REVOKE SELECT, UPDATE ON public.project_ads_telegram_bots FROM authenticated;
GRANT SELECT (
  id, project_id, bot_username, chat_id, chat_title, allowed_chat_ids, default_cabinet_id,
  default_destination, default_goal, default_daily_budget, default_country, default_city, is_active,
  last_test_at, last_test_ok, last_test_error, created_by, created_at, updated_at, default_geo,
  default_age_min, default_age_max, default_gender, default_objective, default_placements
) ON public.project_ads_telegram_bots TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.project_ads_telegram_bots TO authenticated;
GRANT ALL ON public.project_ads_telegram_bots TO service_role;

REVOKE SELECT, UPDATE ON public.project_telegram_bots FROM authenticated;
GRANT SELECT (
  id, project_id, bot_username, chat_id, chat_title, is_active, last_test_at, last_test_ok,
  last_test_error, created_by, created_at, updated_at
) ON public.project_telegram_bots TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.project_telegram_bots TO authenticated;
GRANT ALL ON public.project_telegram_bots TO service_role;

REVOKE SELECT, UPDATE ON public.whatsapp_config FROM authenticated;
GRANT SELECT (
  user_id, connected, phone, display_name, connected_at, updated_at, id, project_id,
  id_instance, api_url, ads_only, webhook_url, bot_webhook_url, api_token_present, webhook_token_present
) ON public.whatsapp_config TO authenticated;
GRANT INSERT, DELETE ON public.whatsapp_config TO authenticated;
GRANT UPDATE (
  connected, phone, display_name, connected_at, ads_only, webhook_url, bot_webhook_url,
  id_instance, api_url
) ON public.whatsapp_config TO authenticated;
GRANT ALL ON public.whatsapp_config TO service_role;

DROP POLICY IF EXISTS "members write provider keys" ON public.content_factory_provider_keys;
CREATE POLICY "members insert provider keys" ON public.content_factory_provider_keys
  FOR INSERT TO authenticated
  WITH CHECK (user_can_access_project(project_id) AND created_by = auth.uid());
CREATE POLICY "creators update own provider keys" ON public.content_factory_provider_keys
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "creators delete own provider keys" ON public.content_factory_provider_keys
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

REVOKE SELECT, UPDATE ON public.content_factory_provider_keys FROM authenticated;
GRANT SELECT (
  id, project_id, provider, key_hint, priority, is_enabled, status, last_checked_at, last_error,
  balance_info, created_by, created_at, updated_at
) ON public.content_factory_provider_keys TO authenticated;
GRANT UPDATE (
  provider, key_hint, priority, is_enabled, status, last_checked_at, last_error, balance_info
) ON public.content_factory_provider_keys TO authenticated;
GRANT INSERT, DELETE ON public.content_factory_provider_keys TO authenticated;
GRANT ALL ON public.content_factory_provider_keys TO service_role;

DROP POLICY IF EXISTS phone_attribution_select_admin ON public.phone_attribution;
DROP POLICY IF EXISTS phone_attribution_select_members ON public.phone_attribution;
CREATE POLICY phone_attribution_select_members ON public.phone_attribution
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (project_id IS NOT NULL AND user_can_access_project(project_id))
  );

DROP POLICY IF EXISTS creative_posters_public_read ON storage.objects;
CREATE POLICY creative_posters_authenticated_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'creative-posters');
