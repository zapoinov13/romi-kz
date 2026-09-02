CREATE OR REPLACE VIEW public.whatsapp_accounts_safe
WITH (security_invoker = false) AS
SELECT id, project_id, cabinet_id, waba_id, phone_number_id, display_phone, display_name,
       onboarding_mode, connected, connected_at, created_by, created_at, updated_at,
       (access_token IS NOT NULL AND length(access_token) > 0) AS access_token_present
FROM public.whatsapp_accounts
WHERE public.has_role(auth.uid(), 'admin'::app_role) OR public.user_can_access_project(project_id);

REVOKE ALL ON public.whatsapp_accounts_safe FROM anon;
GRANT SELECT ON public.whatsapp_accounts_safe TO authenticated;
GRANT SELECT ON public.whatsapp_accounts_safe TO service_role;