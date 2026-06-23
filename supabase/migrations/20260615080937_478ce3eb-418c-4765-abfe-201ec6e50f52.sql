
-- 1) Lock down sensitive token columns in automation_settings
REVOKE SELECT (cron_secret, sipuni_token, meta_access_token) ON public.automation_settings FROM anon, authenticated;

-- 2) Lock down page_access_token on instagram_accounts
REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM anon, authenticated;

-- 3) Remove overly-broad phone_attribution SELECT policy; keep admin-only
DROP POLICY IF EXISTS phone_attr_select ON public.phone_attribution;

-- 4) Lock down projects.intake_token
REVOKE SELECT (intake_token) ON public.projects FROM anon, authenticated;
