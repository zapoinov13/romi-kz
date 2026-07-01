
-- 1) Lock search_path on the last mutable function
ALTER FUNCTION public.sync_ad_cabinet_meta_columns() SET search_path = public;

-- 2) Defense-in-depth: revoke SELECT on sensitive credential columns for client roles.
--    Service role is unaffected (bypasses grants/RLS).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ad_cabinets','access_token'),
      ('ad_cabinets','app_id'),
      ('ad_cabinets','business_id'),
      ('automation_settings','meta_access_token'),
      ('content_factory_provider_keys','api_key_encrypted'),
      ('instagram_accounts','page_access_token'),
      ('meta_tokens','access_token'),
      ('project_ads_telegram_bots','bot_token'),
      ('project_telegram_bots','bot_token'),
      ('whatsapp_config','api_token'),
      ('whatsapp_config','webhook_token')
    ) AS t(tbl, col)
  LOOP
    EXECUTE format('REVOKE SELECT (%I) ON public.%I FROM authenticated, anon, PUBLIC', r.col, r.tbl);
  END LOOP;
END $$;

-- 3) Explicit storage policies for the private content-factory-generated bucket.
--    Restrictive rules block ANY authenticated/anon write attempt regardless
--    of other permissive policies. Service-role edge functions remain unaffected.
DROP POLICY IF EXISTS "content_factory_generated_block_client_insert" ON storage.objects;
CREATE POLICY "content_factory_generated_block_client_insert"
  ON storage.objects AS RESTRICTIVE FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id <> 'content-factory-generated');

DROP POLICY IF EXISTS "content_factory_generated_block_client_update" ON storage.objects;
CREATE POLICY "content_factory_generated_block_client_update"
  ON storage.objects AS RESTRICTIVE FOR UPDATE
  TO authenticated, anon
  USING (bucket_id <> 'content-factory-generated')
  WITH CHECK (bucket_id <> 'content-factory-generated');

DROP POLICY IF EXISTS "content_factory_generated_block_client_delete" ON storage.objects;
CREATE POLICY "content_factory_generated_block_client_delete"
  ON storage.objects AS RESTRICTIVE FOR DELETE
  TO authenticated, anon
  USING (bucket_id <> 'content-factory-generated');
