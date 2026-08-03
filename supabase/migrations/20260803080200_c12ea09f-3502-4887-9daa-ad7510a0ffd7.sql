DROP POLICY IF EXISTS leads_insert_authed ON public.leads;

CREATE POLICY leads_insert_authed ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (assigned_to IS NULL OR assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR project_id IS NULL
      OR public.user_can_access_project(project_id)
    )
  );