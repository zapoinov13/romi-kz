-- WhatsApp Web (Baileys) — sessions, commands, LID, chat media.
-- Lovable → Cloud → SQL Editor (rgttklitvvqsnlsakvzr). Idempotent.

-- ── Sessions (1 per project) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_web_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'pairing', 'connected', 'error')),
  phone text,
  display_name text,
  qr_data text,
  qr_expires_at timestamptz,
  worker_heartbeat_at timestamptz,
  paired_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_web_sessions_project_uniq
  ON public.whatsapp_web_sessions(project_id);

CREATE INDEX IF NOT EXISTS whatsapp_web_sessions_status_idx
  ON public.whatsapp_web_sessions(status);

ALTER TABLE public.whatsapp_web_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_web_sessions_select" ON public.whatsapp_web_sessions;
CREATE POLICY "wa_web_sessions_select" ON public.whatsapp_web_sessions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.user_can_access_project(project_id)
  );

REVOKE ALL ON public.whatsapp_web_sessions FROM PUBLIC, anon;
GRANT SELECT ON public.whatsapp_web_sessions TO authenticated;
GRANT ALL ON public.whatsapp_web_sessions TO service_role;

-- ── Commands queue (UI → daemon) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_web_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('pair', 'logout', 'send')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'failed')),
  result jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_web_commands_pending_idx
  ON public.whatsapp_web_commands(project_id, status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.whatsapp_web_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_web_commands_select" ON public.whatsapp_web_commands;
CREATE POLICY "wa_web_commands_select" ON public.whatsapp_web_commands
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.user_can_access_project(project_id)
  );

REVOKE ALL ON public.whatsapp_web_commands FROM PUBLIC, anon;
GRANT SELECT ON public.whatsapp_web_commands TO authenticated;
GRANT ALL ON public.whatsapp_web_commands TO service_role;

-- ── Leads: WhatsApp LID (not a phone) ───────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_lid text;

CREATE INDEX IF NOT EXISTS leads_whatsapp_lid_idx
  ON public.leads(project_id, whatsapp_lid)
  WHERE whatsapp_lid IS NOT NULL;

-- ── Communications: media ─────────────────────────────────────────
ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_kind text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS media_filename text;

-- ── Storage bucket for chat media ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-chat-media', 'crm-chat-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "crm_chat_media_public_read" ON storage.objects;
CREATE POLICY "crm_chat_media_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'crm-chat-media');

DROP POLICY IF EXISTS "crm_chat_media_service_write" ON storage.objects;
CREATE POLICY "crm_chat_media_service_write"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'crm-chat-media');

DROP POLICY IF EXISTS "crm_chat_media_service_update" ON storage.objects;
CREATE POLICY "crm_chat_media_service_update"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'crm-chat-media');

NOTIFY pgrst, 'reload schema';
