
-- 1) Column-level revokes for sensitive credentials
REVOKE SELECT (access_token) ON public.ad_cabinets FROM authenticated, anon;
REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM authenticated, anon;
REVOKE SELECT (api_token, webhook_token) ON public.whatsapp_config FROM authenticated, anon;
REVOKE SELECT (cron_secret, meta_access_token) ON public.automation_settings FROM authenticated, anon;
REVOKE SELECT (intake_token) ON public.projects FROM authenticated, anon;

-- 2) Tighten events RLS: null lead_id only for admins
DROP POLICY IF EXISTS events_select_via_lead ON public.events;
DROP POLICY IF EXISTS events_insert_via_lead ON public.events;

CREATE POLICY events_select_via_lead ON public.events
  FOR SELECT TO authenticated
  USING (
    (lead_id IS NULL AND public.has_role(auth.uid(), 'admin'))
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = events.lead_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR l.assigned_to = auth.uid()
          OR l.created_by = auth.uid()
        )
    )
  );

CREATE POLICY events_insert_via_lead ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    (lead_id IS NULL AND public.has_role(auth.uid(), 'admin'))
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = events.lead_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR l.assigned_to = auth.uid()
          OR l.created_by = auth.uid()
        )
    )
  );

NOTIFY pgrst, 'reload schema';
