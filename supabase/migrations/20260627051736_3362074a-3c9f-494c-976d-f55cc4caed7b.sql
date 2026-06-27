DROP POLICY IF EXISTS "Members can upload creative posters" ON storage.objects;
CREATE POLICY "Members can upload creative posters"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'creative-posters'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      (storage.foldername(name))[1] IS NOT NULL
      AND public.user_can_access_project(((storage.foldername(name))[1])::uuid)
    )
  )
);