-- 1) wa_clicks_select: scope from public role to authenticated
DROP POLICY IF EXISTS wa_clicks_select ON public.wa_clicks;
CREATE POLICY wa_clicks_select ON public.wa_clicks
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (project_id IS NOT NULL AND public.user_can_access_project(project_id))
  );

-- 2) automation_settings: hide meta_access_token from client roles.
REVOKE SELECT (meta_access_token) ON public.automation_settings FROM authenticated;
REVOKE SELECT (meta_access_token) ON public.automation_settings FROM anon;

-- 3) whatsapp_config: hide raw tokens from client roles; clients use whatsapp_config_safe.
REVOKE SELECT (api_token, webhook_token) ON public.whatsapp_config FROM authenticated;
REVOKE SELECT (api_token, webhook_token) ON public.whatsapp_config FROM anon;

-- 4) instagram_accounts: safe view + member access; lock raw token column.
CREATE OR REPLACE VIEW public.instagram_accounts_safe
WITH (security_invoker = true) AS
SELECT
  id, project_id, ig_user_id, username, name, profile_picture_url,
  page_id, page_name, followers_count, follows_count, media_count,
  active, last_sync_at, last_error, created_at, updated_at,
  (page_access_token IS NOT NULL AND length(page_access_token) > 0) AS page_access_token_present
FROM public.instagram_accounts;

GRANT SELECT ON public.instagram_accounts_safe TO authenticated;

DROP POLICY IF EXISTS ig_accounts_select ON public.instagram_accounts;
DROP POLICY IF EXISTS ig_accounts_select_members ON public.instagram_accounts;
CREATE POLICY ig_accounts_select_members ON public.instagram_accounts
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.user_can_access_project(project_id)
  );

REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM authenticated;
REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM anon;