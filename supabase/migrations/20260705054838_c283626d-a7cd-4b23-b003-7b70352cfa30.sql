-- Revoke anon EXECUTE on SECURITY DEFINER functions that were open to public.
-- greenapi_ingest: only invoked from Vercel webhook (uses service_role key)
REVOKE EXECUTE ON FUNCTION public.greenapi_ingest(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.greenapi_ingest(jsonb) TO service_role;

-- bind_whatsapp_to_project: called from the app (authenticated only)
REVOKE EXECUTE ON FUNCTION public.bind_whatsapp_to_project(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bind_whatsapp_to_project(uuid, uuid, text, text, text) TO authenticated, service_role;