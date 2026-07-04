-- CRM ingress через Vercel /api/wa-webhook → RPC (обход stale greenapi-webhook edge function).
-- Выполнить в Lovable SQL Editor если миграции не применились автоматически.

CREATE OR REPLACE FUNCTION public.greenapi_ingest(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_instance text;
  v_project_id uuid;
  v_cabinet_id uuid;
  v_chat text;
  v_digits text;
  v_name text;
  v_text text;
  v_ext_id text;
  v_lead_id uuid;
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_owner uuid;
  v_bot_url text;
BEGIN
  v_type := p_payload->>'typeWebhook';

  IF v_type = 'test' OR v_type IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', coalesce(v_type, 'empty'));
  END IF;

  v_instance := coalesce(
    p_payload->'instanceData'->>'idInstance',
    p_payload->>'idInstance'
  );
  IF v_instance IS NULL OR btrim(v_instance) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no idInstance');
  END IF;

  SELECT wc.project_id, wc.cabinet_id, wc.bot_webhook_url
    INTO v_project_id, v_cabinet_id, v_bot_url
    FROM public.whatsapp_config wc
   WHERE wc.id_instance = btrim(v_instance)
   LIMIT 1;

  IF v_project_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown idInstance', 'idInstance', v_instance);
  END IF;

  IF v_type <> 'incomingMessageReceived' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', v_type, 'projectId', v_project_id);
  END IF;

  v_chat := coalesce(
    p_payload->'senderData'->>'chatId',
    p_payload->'senderData'->>'sender'
  );
  v_digits := regexp_replace(coalesce(v_chat, ''), '\D', '', 'g');
  IF length(v_digits) < 8 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'no phone', 'projectId', v_project_id);
  END IF;

  v_name := nullif(btrim(p_payload->'senderData'->>'senderName'), '');
  v_ext_id := nullif(btrim(p_payload->>'idMessage'), '');

  v_text := coalesce(
    nullif(btrim(p_payload->'messageData'->'textMessageData'->>'textMessage'), ''),
    nullif(btrim(p_payload->'messageData'->'extendedTextMessageData'->>'text'), ''),
    '[Сообщение]'
  );

  SELECT l.id INTO v_lead_id
    FROM public.leads l
   WHERE l.is_personal = false
     AND l.project_id = v_project_id
     AND regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') = v_digits
   ORDER BY l.created_at DESC
   LIMIT 1;

  IF v_lead_id IS NULL THEN
    PERFORM public.ensure_project_pipeline(v_project_id);

    SELECT p.id, ps.id INTO v_pipeline_id, v_stage_id
      FROM public.pipelines p
      JOIN public.pipeline_stages ps ON ps.pipeline_id = p.id
     WHERE p.project_id = v_project_id
     ORDER BY p.is_default DESC NULLS LAST, ps.order_index ASC
     LIMIT 1;

    IF v_stage_id IS NULL THEN
      SELECT p.id, ps.id INTO v_pipeline_id, v_stage_id
        FROM public.pipelines p
        JOIN public.pipeline_stages ps ON ps.pipeline_id = p.id
       ORDER BY ps.order_index ASC
       LIMIT 1;
    END IF;

    IF v_stage_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no pipeline stage', 'projectId', v_project_id);
    END IF;

    SELECT pr.created_by INTO v_owner FROM public.projects pr WHERE pr.id = v_project_id;

    INSERT INTO public.leads (
      name, phone, source, channel, project_id, cabinet_id,
      pipeline_id, stage_id, created_by, assigned_to
    )
    VALUES (
      coalesce(v_name, '+' || v_digits),
      '+' || v_digits,
      'whatsapp',
      'whatsapp',
      v_project_id,
      v_cabinet_id,
      v_pipeline_id,
      v_stage_id,
      v_owner,
      v_owner
    )
    RETURNING id INTO v_lead_id;
  END IF;

  IF v_ext_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.communications c WHERE c.external_id = v_ext_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'leadId', v_lead_id, 'deduped', true, 'projectId', v_project_id);
  END IF;

  INSERT INTO public.communications (
    lead_id, type, direction, channel, content, status, is_draft, is_auto, external_id
  )
  VALUES (
    v_lead_id, 'message', 'in', 'whatsapp', v_text, 'delivered', false, false, v_ext_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'leadId', v_lead_id,
    'projectId', v_project_id,
    'botWebhookUrl', v_bot_url
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.greenapi_ingest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.greenapi_ingest(jsonb) TO anon, authenticated, service_role;
