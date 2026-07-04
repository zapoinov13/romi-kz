-- Владелец / создатель может удалить свой проект (не is_primary).
-- Раньше DELETE был только у admin → UI молча не удалял.

DROP POLICY IF EXISTS "projects_delete_admin" ON public.projects;
DROP POLICY IF EXISTS projects_delete_owner ON public.projects;

CREATE POLICY projects_delete_owner ON public.projects
  FOR DELETE TO authenticated
  USING (
    COALESCE(is_primary, false) IS NOT TRUE
    AND (
      public.has_role(auth.uid(), 'admin')
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_members m
        WHERE m.project_id = projects.id
          AND m.user_id = auth.uid()
          AND m.role = 'owner'
      )
    )
  );
