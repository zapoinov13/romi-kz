REVOKE SELECT ON public.sipuni_cdr_log FROM authenticated, anon;
GRANT SELECT (id, phone_normalized, recording_url, duration_sec, started_at, processing_status, lead_id_resolved, error_text, created_at) ON public.sipuni_cdr_log TO authenticated;
GRANT ALL ON public.sipuni_cdr_log TO service_role;