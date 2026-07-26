-- WhatsApp Web without service_role (Lovable-friendly).
-- Run AFTER scripts/lovable-whatsapp-web.sql
-- Sets worker key + SECURITY DEFINER RPC + authenticated write policies.

-- ── Worker secret (same value as Vercel WA_WEB_WORKER_KEY + VPS) ─────
CREATE TABLE IF NOT EXISTS public.wa_web_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  worker_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.wa_web_config (id, worker_key)
VALUES (1, 'e408a3c4adb7509cdf0a05b32ddcd50c85ec105b72026a04cf260229b02f473b')
ON CONFLICT (id) DO UPDATE
  SET worker_key = EXCLUDED.worker_key,
      updated_at = now();

ALTER TABLE public.wa_web_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_web_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wa_web_config TO service_role;

-- ── Authenticated writes (UI via JWT, no service_role) ───────────────
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_web_sessions TO authenticated;
GRANT SELECT, INSERT ON public.whatsapp_web_commands TO authenticated;

DROP POLICY IF EXISTS "wa_web_sessions_insert" ON public.whatsapp_web_sessions;
CREATE POLICY "wa_web_sessions_insert" ON public.whatsapp_web_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.user_can_access_project(project_id)
  );

DROP POLICY IF EXISTS "wa_web_sessions_update" ON public.whatsapp_web_sessions;
CREATE POLICY "wa_web_sessions_update" ON public.whatsapp_web_sessions
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.user_can_access_project(project_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.user_can_access_project(project_id)
  );

DROP POLICY IF EXISTS "wa_web_commands_insert" ON public.whatsapp_web_commands;
CREATE POLICY "wa_web_commands_insert" ON public.whatsapp_web_commands
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.user_can_access_project(project_id)
  );

-- Storage: anon insert so Vercel bridge can upload media without service_role
DROP POLICY IF EXISTS "crm_chat_media_anon_insert" ON storage.objects;
CREATE POLICY "crm_chat_media_anon_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'crm-chat-media');

-- ── Worker RPC (bypasses RLS) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_web_worker(
  p_key text,
  p_action text,
  p_body jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored text;
  v_now timestamptz := now();
  v_project uuid;
  v_status text;
  v_limit int;
  v_id uuid;
  v_phone text;
  v_lid text;
  v_digits text;
  v_name text;
  v_direction text;
  v_text text;
  v_ext text;
  v_lead uuid;
  v_pipe uuid;
  v_stage uuid;
  v_owner uuid;
  v_row jsonb;
  v_cmds jsonb;
  v_media_url text;
  v_media_kind text;
  v_media_mime text;
  v_media_filename text;
BEGIN
  SELECT worker_key INTO stored FROM public.wa_web_config WHERE id = 1;
  IF stored IS NULL OR p_key IS NULL OR p_key <> stored THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'heartbeat' THEN
    IF p_body ? 'project_id' AND nullif(p_body->>'project_id','') IS NOT NULL THEN
      v_project := (p_body->>'project_id')::uuid;
      INSERT INTO public.whatsapp_web_sessions (project_id, status)
      VALUES (v_project, 'disconnected')
      ON CONFLICT (project_id) DO NOTHING;
      UPDATE public.whatsapp_web_sessions
        SET worker_heartbeat_at = v_now, updated_at = v_now
      WHERE project_id = v_project;
    ELSE
      UPDATE public.whatsapp_web_sessions
        SET worker_heartbeat_at = v_now, updated_at = v_now
      WHERE status IN ('connected', 'pairing');
    END IF;
    RETURN jsonb_build_object('ok', true, 'at', v_now);

  ELSIF p_action = 'list_sessions' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_cmds
    FROM (
      SELECT id, project_id, status, phone, display_name, qr_expires_at, worker_heartbeat_at
      FROM public.whatsapp_web_sessions
      WHERE status IN ('connected', 'pairing')
    ) s;
    RETURN jsonb_build_object('ok', true, 'sessions', v_cmds);

  ELSIF p_action = 'push_qr' THEN
    v_project := (p_body->>'project_id')::uuid;
    IF v_project IS NULL OR nullif(p_body->>'qr_data','') IS NULL THEN
      RAISE EXCEPTION 'project_id, qr_data required';
    END IF;
    INSERT INTO public.whatsapp_web_sessions (project_id, status)
    VALUES (v_project, 'pairing')
    ON CONFLICT (project_id) DO NOTHING;
    UPDATE public.whatsapp_web_sessions SET
      status = 'pairing',
      qr_data = p_body->>'qr_data',
      qr_expires_at = v_now + interval '60 seconds',
      last_error = null,
      updated_at = v_now
    WHERE project_id = v_project;
    RETURN jsonb_build_object('ok', true, 'qr_expires_at', v_now + interval '60 seconds');

  ELSIF p_action = 'set_state' THEN
    v_project := (p_body->>'project_id')::uuid;
    v_status := p_body->>'status';
    IF v_project IS NULL OR v_status NOT IN ('disconnected','pairing','connected','error') THEN
      RAISE EXCEPTION 'project_id + valid status required';
    END IF;
    INSERT INTO public.whatsapp_web_sessions (project_id, status)
    VALUES (v_project, 'disconnected')
    ON CONFLICT (project_id) DO NOTHING;
    UPDATE public.whatsapp_web_sessions SET
      status = v_status,
      updated_at = v_now,
      last_error = nullif(p_body->>'last_error',''),
      phone = CASE WHEN p_body ? 'phone' THEN p_body->>'phone' ELSE phone END,
      display_name = CASE WHEN p_body ? 'display_name' THEN p_body->>'display_name' ELSE display_name END,
      paired_at = CASE WHEN v_status = 'connected' THEN v_now ELSE paired_at END,
      qr_data = CASE WHEN v_status IN ('connected','disconnected') THEN null ELSE qr_data END,
      qr_expires_at = CASE WHEN v_status IN ('connected','disconnected') THEN null ELSE qr_expires_at END
    WHERE project_id = v_project;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'claim' THEN
    v_limit := least(coalesce((p_body->>'limit')::int, 20), 50);
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at), '[]'::jsonb) INTO v_cmds
    FROM (
      SELECT *
      FROM public.whatsapp_web_commands
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT v_limit
    ) c;
    RETURN jsonb_build_object('ok', true, 'commands', v_cmds);

  ELSIF p_action = 'ack' THEN
    v_id := coalesce(p_body->>'command_id', p_body->>'id')::uuid;
    v_status := p_body->>'status';
    IF v_id IS NULL OR v_status NOT IN ('done','failed') THEN
      RAISE EXCEPTION 'command_id + status done|failed required';
    END IF;
    UPDATE public.whatsapp_web_commands SET
      status = v_status,
      result = p_body->'result',
      updated_at = v_now
    WHERE id = v_id;
    RETURN jsonb_build_object('ok', true);

  ELSIF p_action = 'ingest' THEN
    v_project := (p_body->>'project_id')::uuid;
    IF v_project IS NULL THEN RAISE EXCEPTION 'project_id required'; END IF;
    v_direction := CASE WHEN p_body->>'direction' = 'out' THEN 'out' ELSE 'in' END;
    v_text := nullif(trim(coalesce(p_body->>'text', p_body->>'content', '')), '');
    IF v_text IS NULL THEN v_text := '[Сообщение]'; END IF;
    v_ext := nullif(p_body->>'external_id','');
    v_digits := regexp_replace(coalesce(p_body->>'phone',''), '\D', '', 'g');
    IF length(v_digits) < 8 OR length(v_digits) > 15 THEN v_digits := null; END IF;
    v_lid := nullif(p_body->>'whatsapp_lid','');
    v_name := nullif(p_body->>'name','');
    v_media_url := nullif(p_body->>'media_url','');
    v_media_kind := nullif(p_body->>'media_kind','');
    v_media_mime := nullif(p_body->>'media_mime','');
    v_media_filename := nullif(p_body->>'media_filename','');

    IF v_digits IS NULL AND v_lid IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'need phone or lid');
    END IF;

    -- find lead
    IF v_lid IS NOT NULL THEN
      SELECT id INTO v_lead FROM public.leads
      WHERE project_id = v_project AND whatsapp_lid = v_lid LIMIT 1;
    END IF;
    IF v_lead IS NULL AND v_digits IS NOT NULL THEN
      SELECT id INTO v_lead FROM public.leads
      WHERE project_id = v_project
        AND (
          phone = ('+' || v_digits)
          OR phone = v_digits
          OR phone = ('+' || v_digits)
        )
      LIMIT 1;
    END IF;

    IF v_lead IS NOT NULL AND v_lid IS NOT NULL THEN
      UPDATE public.leads SET whatsapp_lid = v_lid WHERE id = v_lead;
    END IF;

    -- create lead on inbound with phone
    IF v_lead IS NULL AND v_direction = 'in' AND v_digits IS NOT NULL THEN
      SELECT p.id INTO v_pipe
      FROM public.pipelines p
      WHERE p.project_id = v_project AND p.is_default = true
      ORDER BY p.created_at ASC LIMIT 1;
      IF v_pipe IS NULL THEN
        SELECT p.id INTO v_pipe FROM public.pipelines p
        WHERE p.project_id = v_project ORDER BY p.created_at ASC LIMIT 1;
      END IF;
      IF v_pipe IS NOT NULL THEN
        SELECT s.id INTO v_stage FROM public.pipeline_stages s
        WHERE s.pipeline_id = v_pipe AND s.key = 'new' LIMIT 1;
        IF v_stage IS NULL THEN
          SELECT s.id INTO v_stage FROM public.pipeline_stages s
          WHERE s.pipeline_id = v_pipe ORDER BY s.order_index ASC LIMIT 1;
        END IF;
      END IF;
      SELECT created_by INTO v_owner FROM public.projects WHERE id = v_project;
      IF v_pipe IS NOT NULL AND v_stage IS NOT NULL THEN
        INSERT INTO public.leads (
          name, phone, whatsapp_lid, source, channel,
          project_id, pipeline_id, stage_id, created_by, assigned_to
        ) VALUES (
          coalesce(v_name, '+' || v_digits),
          '+' || v_digits,
          v_lid,
          'whatsapp', 'whatsapp',
          v_project, v_pipe, v_stage, v_owner, v_owner
        )
        RETURNING id INTO v_lead;
      END IF;
    END IF;

    IF v_lead IS NULL THEN
      RETURN jsonb_build_object(
        'ok', true, 'skipped', true,
        'reason', CASE WHEN v_digits IS NULL THEN 'lid_only_no_lead' ELSE 'lead_create_failed' END
      );
    END IF;

    IF v_ext IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.communications WHERE external_id = v_ext) THEN
        RETURN jsonb_build_object('ok', true, 'deduped', true, 'lead_id', v_lead);
      END IF;
    END IF;

    INSERT INTO public.communications (
      lead_id, type, direction, channel, content, status,
      is_draft, is_auto, external_id,
      media_url, media_kind, media_mime, media_filename
    ) VALUES (
      v_lead, 'message', v_direction, 'whatsapp', v_text,
      CASE WHEN v_direction = 'in' THEN 'delivered' ELSE 'sent' END,
      false, false, v_ext,
      v_media_url, v_media_kind, v_media_mime, v_media_filename
    );

    IF v_direction = 'in' THEN
      UPDATE public.leads SET last_activity_at = v_now, last_inbound_at = v_now WHERE id = v_lead;
    ELSE
      UPDATE public.leads SET last_activity_at = v_now, last_outbound_at = v_now WHERE id = v_lead;
    END IF;

    RETURN jsonb_build_object('ok', true, 'lead_id', v_lead);

  ELSE
    RAISE EXCEPTION 'unknown worker action: %', p_action;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_web_worker(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_web_worker(text, text, jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
