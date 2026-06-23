-- 1. Revoke column-level SELECT on sensitive credential columns from authenticated.
--    service_role keeps full access (bypasses these grants); safe views unaffected
--    because they are owned by postgres and execute without checking client perms
--    on excluded columns.

-- ad_cabinets: Meta access_token + app credentials
REVOKE SELECT (access_token, app_id, business_id) ON public.ad_cabinets FROM authenticated;
REVOKE SELECT (access_token, app_id, business_id) ON public.ad_cabinets FROM anon;

-- instagram_accounts: long-lived page access token
REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM authenticated;
REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM anon;

-- project_ads_telegram_bots: bot_token
REVOKE SELECT (bot_token) ON public.project_ads_telegram_bots FROM authenticated;
REVOKE SELECT (bot_token) ON public.project_ads_telegram_bots FROM anon;

-- project_telegram_bots: bot_token
REVOKE SELECT (bot_token) ON public.project_telegram_bots FROM authenticated;
REVOKE SELECT (bot_token) ON public.project_telegram_bots FROM anon;

-- whatsapp_config: GreenAPI api_token + webhook_token
REVOKE SELECT (api_token, webhook_token) ON public.whatsapp_config FROM authenticated;
REVOKE SELECT (api_token, webhook_token) ON public.whatsapp_config FROM anon;

-- content_factory_provider_keys: encrypted AI provider key material
REVOKE SELECT (api_key_encrypted) ON public.content_factory_provider_keys FROM authenticated;
REVOKE SELECT (api_key_encrypted) ON public.content_factory_provider_keys FROM anon;

-- automation_settings: Sipuni / Meta / cron secrets (already admin-only by RLS,
-- but plaintext is still shipped to admin client; hide from client entirely)
REVOKE SELECT (sipuni_token, meta_access_token, cron_secret) ON public.automation_settings FROM authenticated;
REVOKE SELECT (sipuni_token, meta_access_token, cron_secret) ON public.automation_settings FROM anon;

-- 2. Lock down ads-telegram-media private bucket: drop overbroad authenticated
--    SELECT policy. Only edge functions (service_role) read these files.
DROP POLICY IF EXISTS ads_tg_media_members_read ON storage.objects;
