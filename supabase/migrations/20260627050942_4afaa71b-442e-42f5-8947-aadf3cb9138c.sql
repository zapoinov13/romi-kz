
DROP POLICY IF EXISTS creative_posters_member_read ON storage.objects;

CREATE POLICY creative_posters_member_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'creative-posters'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      (storage.foldername(name))[1] IS NOT NULL
      AND public.user_can_access_project(((storage.foldername(name))[1])::uuid)
    )
  )
);
