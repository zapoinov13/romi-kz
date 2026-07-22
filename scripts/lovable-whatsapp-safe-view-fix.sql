-- Fix: whatsapp_accounts_safe must work for authenticated without granting access_token.
-- Run in Lovable SQL Editor after coexistence SQL.

ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS access_token_present boolean
  GENERATED ALWAYS AS (
    access_token IS NOT NULL AND length(btrim(access_token)) > 0
  ) STORED;

CREATE OR REPLACE VIEW public.whatsapp_accounts_safe
WITH (security_invoker = true) AS
SELECT
  id,
  project_id,
  cabinet_id,
  waba_id,
  phone_number_id,
  display_phone,
  display_name,
  onboarding_mode,
  connected,
  connected_at,
  created_by,
  created_at,
  updated_at,
  access_token_present
FROM public.whatsapp_accounts;

GRANT SELECT ON public.whatsapp_accounts_safe TO authenticated;

GRANT SELECT (
  id, project_id, cabinet_id, waba_id, phone_number_id,
  display_phone, display_name, onboarding_mode, connected, connected_at,
  created_by, created_at, updated_at, access_token_present
) ON public.whatsapp_accounts TO authenticated;

NOTIFY pgrst, 'reload schema';
