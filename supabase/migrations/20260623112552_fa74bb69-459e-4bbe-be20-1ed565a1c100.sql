-- 1. phone_attribution: admins only
DROP POLICY IF EXISTS phone_attribution_select_members ON public.phone_attribution;
CREATE POLICY phone_attribution_select_admins
  ON public.phone_attribution
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. creative-posters bucket: drop broad listing policy (public CDN access unaffected)
DROP POLICY IF EXISTS creative_posters_authenticated_read ON storage.objects;

-- 3. Revoke client EXECUTE on admin/cron-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.meta_structure_sync(date, date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_cdi_for_project(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_lead_attribution(uuid, date) FROM PUBLIC, anon, authenticated;
