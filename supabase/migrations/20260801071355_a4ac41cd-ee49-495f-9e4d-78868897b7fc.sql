-- 1. crm-chat-media: no anonymous access, member-scoped reads
DROP POLICY IF EXISTS "crm_chat_media_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "crm_chat_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "crm_chat_media_member_read" ON storage.objects;

CREATE POLICY "crm_chat_media_member_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'crm-chat-media'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (
        (storage.foldername(name))[1] IS NOT NULL
        AND public.user_can_access_project(((storage.foldername(name))[1])::uuid)
      )
    )
  );

CREATE POLICY "crm_chat_media_service_read" ON storage.objects
  FOR SELECT TO service_role
  USING (bucket_id = 'crm-chat-media');

CREATE POLICY "crm_chat_media_service_delete" ON storage.objects
  FOR DELETE TO service_role
  USING (bucket_id = 'crm-chat-media');

-- 2. SECURITY DEFINER functions must not be callable by anon/PUBLIC
DO $$
DECLARE
  r record;
  fn_list text[] := ARRAY[
    'greenapi_ingest',
    'wa_web_worker',
    'bind_whatsapp_account',
    'unbind_whatsapp_account',
    'trg_whatsapp_accounts_cabinet_project'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (fn_list)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF r.proname IN ('greenapi_ingest', 'wa_web_worker', 'trg_whatsapp_accounts_cabinet_project') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;