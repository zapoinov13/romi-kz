-- Meta WhatsApp Business Coexistence accounts (Cloud API).
-- Legacy whatsapp_config (Green API) is kept for transition; new UI uses whatsapp_accounts.

CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cabinet_id uuid NOT NULL REFERENCES public.ad_cabinets(id) ON DELETE CASCADE,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  display_phone text,
  display_name text,
  access_token text,
  onboarding_mode text NOT NULL DEFAULT 'coexistence'
    CHECK (onboarding_mode IN ('coexistence', 'cloud_api')),
  connected boolean NOT NULL DEFAULT false,
  connected_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_accounts_phone_number_id_uniq
  ON public.whatsapp_accounts(phone_number_id);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_accounts_cabinet_uniq
  ON public.whatsapp_accounts(cabinet_id);

CREATE INDEX IF NOT EXISTS whatsapp_accounts_project_idx
  ON public.whatsapp_accounts(project_id);

CREATE INDEX IF NOT EXISTS whatsapp_accounts_waba_idx
  ON public.whatsapp_accounts(waba_id);

-- Keep cabinet.project_id aligned with account.project_id
CREATE OR REPLACE FUNCTION public.trg_whatsapp_accounts_cabinet_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cab_project uuid;
BEGIN
  SELECT project_id INTO v_cab_project
    FROM public.ad_cabinets
   WHERE id = NEW.cabinet_id;
  IF v_cab_project IS NULL OR v_cab_project <> NEW.project_id THEN
    RAISE EXCEPTION 'cabinet does not belong to this project';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_accounts_cabinet_project ON public.whatsapp_accounts;
CREATE TRIGGER whatsapp_accounts_cabinet_project
BEFORE INSERT OR UPDATE OF project_id, cabinet_id ON public.whatsapp_accounts
FOR EACH ROW EXECUTE FUNCTION public.trg_whatsapp_accounts_cabinet_project();

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_accounts_select" ON public.whatsapp_accounts;
CREATE POLICY "wa_accounts_select" ON public.whatsapp_accounts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.user_can_access_project(project_id)
  );

-- No direct INSERT/UPDATE/DELETE for clients — only via SECURITY DEFINER RPCs / service_role
REVOKE ALL ON public.whatsapp_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_accounts TO service_role;

-- Flag without exposing access_token to clients
ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS access_token_present boolean
  GENERATED ALWAYS AS (
    access_token IS NOT NULL AND length(btrim(access_token)) > 0
  ) STORED;

GRANT SELECT (
  id, project_id, cabinet_id, waba_id, phone_number_id,
  display_phone, display_name, onboarding_mode, connected, connected_at,
  created_by, created_at, updated_at, access_token_present
) ON public.whatsapp_accounts TO authenticated;

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
  COALESCE(access_token_present, false) AS access_token_present
FROM public.whatsapp_accounts;

GRANT SELECT ON public.whatsapp_accounts_safe TO authenticated;

-- Temporary state for Embedded Signup sessions
CREATE TABLE IF NOT EXISTS public.whatsapp_onboarding_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cabinet_id uuid NOT NULL REFERENCES public.ad_cabinets(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_onboarding_states_user_idx
  ON public.whatsapp_onboarding_states(user_id);

ALTER TABLE public.whatsapp_onboarding_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_onboarding_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_onboarding_states TO service_role;

-- Bind / upsert account after Coexistence onboarding (service_role or via edge)
CREATE OR REPLACE FUNCTION public.bind_whatsapp_account(
  p_project_id uuid,
  p_cabinet_id uuid,
  p_waba_id text,
  p_phone_number_id text,
  p_access_token text,
  p_display_phone text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_onboarding_mode text DEFAULT 'coexistence'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_cabinet_project uuid;
BEGIN
  IF p_project_id IS NULL OR p_cabinet_id IS NULL
     OR NULLIF(btrim(p_waba_id), '') IS NULL
     OR NULLIF(btrim(p_phone_number_id), '') IS NULL
     OR NULLIF(btrim(p_access_token), '') IS NULL THEN
    RAISE EXCEPTION 'project_id, cabinet_id, waba_id, phone_number_id and access_token are required';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.user_can_access_project(p_project_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT project_id INTO v_cabinet_project
    FROM public.ad_cabinets
   WHERE id = p_cabinet_id;
  IF v_cabinet_project IS NULL OR v_cabinet_project <> p_project_id THEN
    RAISE EXCEPTION 'cabinet does not belong to this project';
  END IF;

  INSERT INTO public.whatsapp_accounts (
    project_id, cabinet_id, waba_id, phone_number_id, access_token,
    display_phone, display_name, onboarding_mode, connected, connected_at, created_by
  )
  VALUES (
    p_project_id, p_cabinet_id, btrim(p_waba_id), btrim(p_phone_number_id), btrim(p_access_token),
    NULLIF(btrim(COALESCE(p_display_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_display_name, '')), ''),
    COALESCE(NULLIF(btrim(p_onboarding_mode), ''), 'coexistence'),
    true, now(), auth.uid()
  )
  ON CONFLICT (phone_number_id) DO UPDATE SET
    project_id = EXCLUDED.project_id,
    cabinet_id = EXCLUDED.cabinet_id,
    waba_id = EXCLUDED.waba_id,
    access_token = EXCLUDED.access_token,
    display_phone = COALESCE(EXCLUDED.display_phone, public.whatsapp_accounts.display_phone),
    display_name = COALESCE(EXCLUDED.display_name, public.whatsapp_accounts.display_name),
    onboarding_mode = EXCLUDED.onboarding_mode,
    connected = true,
    connected_at = now(),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bind_whatsapp_account(uuid, uuid, text, text, text, text, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unbind_whatsapp_account(
  p_account_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project uuid;
BEGIN
  SELECT project_id INTO v_project FROM public.whatsapp_accounts WHERE id = p_account_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'whatsapp account not found';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.user_can_access_project(v_project)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.whatsapp_accounts WHERE id = p_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unbind_whatsapp_account(uuid) TO authenticated, service_role;
