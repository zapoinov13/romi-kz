
-- Restrict sensitive API credentials at the column level. Authenticated users
-- can still read other columns of the row, but tokens become readable only by
-- service_role (edge functions / admin code).

REVOKE SELECT (access_token) ON public.ad_cabinets FROM authenticated, anon;
REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM authenticated, anon;
REVOKE SELECT (api_token, webhook_token) ON public.whatsapp_config FROM authenticated, anon;

-- Phone attribution: SELECT only for admins (writes are already admin-only).
DROP POLICY IF EXISTS phone_attribution_select_visible ON public.phone_attribution;
DROP POLICY IF EXISTS phone_attribution_select ON public.phone_attribution;
CREATE POLICY phone_attribution_select_admin ON public.phone_attribution
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
