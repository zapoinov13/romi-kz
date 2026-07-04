-- Reject phonebook labels (муж/жена) as lead names; use phone instead.

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
  v_direction public.communication_direction;
  v_is_auto boolean;
  v_status text;
  v_raw_status text;
  v_chat_name text;
  v_sender_name text;
  v_contact_name text;
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

  IF v_type = 'outgoingMessageStatus' THEN
    v_ext_id := nullif(btrim(p_payload->>'idMessage'), '');
    v_raw_status := nullif(btrim(p_payload->>'status'), '');
    IF v_ext_id IS NULL OR v_raw_status IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'no id/status', 'projectId', v_project_id);
    END IF;
    v_status := CASE v_raw_status
      WHEN 'sent' THEN 'sent'
      WHEN 'delivered' THEN 'delivered'
      WHEN 'read' THEN 'read'
      WHEN 'noAccount' THEN 'failed'
      WHEN 'failed' THEN 'failed'
      WHEN 'notDelivered' THEN 'failed'
      ELSE v_raw_status
    END;
    UPDATE public.communications
       SET status = v_status
     WHERE external_id = v_ext_id;
    RETURN jsonb_build_object(
      'ok', true,
      'externalId', v_ext_id,
      'status', v_status,
      'projectId', v_project_id,
      'botWebhookUrl', v_bot_url
    );
  END IF;

  IF v_type = 'incomingMessageReceived' THEN
    v_direction := 'in';
    v_is_auto := false;
  ELSIF v_type = 'outgoingMessageReceived' THEN
    v_direction := 'out';
    v_is_auto := false;
  ELSIF v_type = 'outgoingAPIMessageReceived' THEN
    v_direction := 'out';
    v_is_auto := true;
  ELSE
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

  -- WhatsApp profile: chatName / senderName. Never senderContactName (phone book label like «муж»).
  v_chat_name := nullif(btrim(p_payload->'senderData'->>'chatName'), '');
  v_sender_name := nullif(btrim(p_payload->'senderData'->>'senderName'), '');
  v_contact_name := nullif(btrim(p_payload->'senderData'->>'senderContactName'), '');
  v_name := v_chat_name;
  IF v_name IS NULL AND v_sender_name IS NOT NULL THEN
    IF v_contact_name IS NULL OR v_sender_name <> v_contact_name THEN
      v_name := v_sender_name;
    END IF;
  END IF;
  -- Green API часто шлёт «муж»/«жена» и в chatName — метка из телефонной книги, не профиль WA.
  IF v_name IS NOT NULL AND (
    lower(btrim(v_name)) IN (
      'муж', 'жена', 'wife', 'husband', 'мама', 'папа', 'mom', 'dad',
      'брат', 'сестра', 'bro', 'sis', 'brother', 'sister', 'друг', 'подруга',
      'клиент', 'client', 'customer', 'заказчик', 'пациент', 'patient'
    )
    OR (v_contact_name IS NOT NULL AND v_name = v_contact_name)
  ) THEN
    v_name := NULL;
  END IF;

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

  IF v_direction = 'in'::public.communication_direction THEN
    IF v_name IS NOT NULL THEN
      UPDATE public.leads l
         SET name = v_name
       WHERE l.id = v_lead_id
         AND (
           l.name IS NULL OR btrim(l.name) = ''
           OR l.name ~ '^\+\d'
           OR lower(btrim(l.name)) IN ('муж', 'жена', 'wife', 'husband', 'мама', 'папа')
           OR (v_contact_name IS NOT NULL AND l.name = v_contact_name)
         );
    ELSE
      UPDATE public.leads l
         SET name = '+' || v_digits
       WHERE l.id = v_lead_id
         AND lower(btrim(l.name)) IN ('муж', 'жена', 'wife', 'husband', 'мама', 'папа');
    END IF;
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
    v_lead_id,
    'message',
    v_direction,
    'whatsapp',
    v_text,
    CASE WHEN v_direction = 'out'::public.communication_direction THEN 'sent' ELSE 'delivered' END,
    false,
    v_is_auto,
    v_ext_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'leadId', v_lead_id,
    'direction', v_direction,
    'projectId', v_project_id,
    'botWebhookUrl', v_bot_url
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.greenapi_ingest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.greenapi_ingest(jsonb) TO anon, authenticated, service_role;
