DROP POLICY IF EXISTS creative_posters_member_read ON storage.objects;
CREATE POLICY creative_posters_member_read ON storage.objects
FOR SELECT
USING (
  bucket_id = 'creative-posters'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.ad_cabinets c
      WHERE c.id::text = split_part(storage.objects.name, '/', 1)
        AND public.user_can_access_project(c.project_id)
    )
  )
);