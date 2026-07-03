
-- Fix SUPA_function_search_path_mutable: pin search_path on remaining function
ALTER FUNCTION public.build_sales_source_label(text, jsonb, text, text, text) SET search_path = public;

-- Fix SUPA_anon_security_definer_function_executable: strip anon EXECUTE on SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.find_lead_id_by_phone(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_lead_id_by_phone(uuid, text) TO authenticated, service_role;

-- Idempotent lockdown of secret columns (defensive - already revoked)
REVOKE SELECT (access_token, app_id) ON public.ad_cabinets FROM authenticated, anon, PUBLIC;
REVOKE SELECT (sipuni_token, cron_secret) ON public.automation_settings FROM authenticated, anon, PUBLIC;
REVOKE SELECT (api_key_encrypted) ON public.content_factory_provider_keys FROM authenticated, anon, PUBLIC;
REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM authenticated, anon, PUBLIC;
REVOKE SELECT (access_token) ON public.meta_tokens FROM authenticated, anon, PUBLIC;
REVOKE SELECT (bot_token) ON public.project_ads_telegram_bots FROM authenticated, anon, PUBLIC;
REVOKE SELECT (bot_token) ON public.project_telegram_bots FROM authenticated, anon, PUBLIC;
REVOKE SELECT (api_token, webhook_token) ON public.whatsapp_config FROM authenticated, anon, PUBLIC;
