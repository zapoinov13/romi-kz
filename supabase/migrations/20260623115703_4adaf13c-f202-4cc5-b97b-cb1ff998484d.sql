-- Allow authenticated users to read creative-posters (bucket is now private)
DROP POLICY IF EXISTS "creative_posters_authenticated_read" ON storage.objects;
CREATE POLICY "creative_posters_authenticated_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'creative-posters');

-- Revoke anon execute on resolve_intake_project; edge functions use service_role
REVOKE EXECUTE ON FUNCTION public.resolve_intake_project(text) FROM anon, PUBLIC;