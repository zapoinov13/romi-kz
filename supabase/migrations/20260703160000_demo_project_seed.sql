-- Демо-проект: флаг is_demo + функция заполнения тестовыми данными
-- Запуск: SELECT public.seed_demo_project('Юрий');

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.is_demo IS
  'Тестовый проект с демо-данными для презентации платформы';

CREATE OR REPLACE FUNCTION public.seed_demo_project(p_project_name text DEFAULT 'Юрий')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_pipeline_id uuid;
  v_cabinet_id uuid;
  v_cabinet_ext text := 'act_demo_yuriy';
  v_demo_source text := 'demo_seed';
  v_month_start date := date_trunc('month', CURRENT_DATE)::date;
  rec record;
  v_lead_id uuid;
  v_stage_id uuid;
  v_service_id uuid;
  v_created timestamptz;
  v_day date;
  v_spend numeric;
  v_meta_leads int;
  v_leads_inserted int := 0;
  v_msgs_inserted int := 0;
  v_notes_inserted int := 0;
  v_tasks_inserted int := 0;
  v_cdi_days int := 0;
BEGIN
  SELECT id INTO v_project_id
  FROM public.projects
  WHERE lower(trim(name)) = lower(trim(p_project_name))
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Проект «%» не найден. Создайте его в интерфейсе и запустите снова.', p_project_name;
  END IF;

  UPDATE public.projects
  SET
    is_demo = true,
    domain = COALESCE(NULLIF(trim(domain), ''), 'demo.local'),
    initials = COALESCE(NULLIF(trim(initials), ''), 'Ю'),
    updated_at = now()
  WHERE id = v_project_id;

  v_pipeline_id := public.ensure_project_pipeline(v_project_id);

  DELETE FROM public.communications
  WHERE lead_id IN (
    SELECT id FROM public.leads WHERE project_id = v_project_id AND source = v_demo_source
  );
  DELETE FROM public.tasks
  WHERE lead_id IN (
    SELECT id FROM public.leads WHERE project_id = v_project_id AND source = v_demo_source
  );
  DELETE FROM public.lead_status_history
  WHERE lead_id IN (
    SELECT id FROM public.leads WHERE project_id = v_project_id AND source = v_demo_source
  );
  DELETE FROM public.events
  WHERE lead_id IN (
    SELECT id FROM public.leads WHERE project_id = v_project_id AND source = v_demo_source
  );
  DELETE FROM public.leads
  WHERE project_id = v_project_id AND source = v_demo_source;

  SELECT id INTO v_cabinet_id
  FROM public.ad_cabinets
  WHERE project_id = v_project_id AND external_id = v_cabinet_ext
  LIMIT 1;

  IF v_cabinet_id IS NULL THEN
    INSERT INTO public.ad_cabinets (
      project_id, name, external_id, ad_account_id, type, online, provider, currency, city
    ) VALUES (
      v_project_id,
      'Демо Meta · ' || p_project_name,
      v_cabinet_ext,
      v_cabinet_ext,
      'Личный',
      true,
      'meta',
      'USD',
      'Алматы'
    )
    RETURNING id INTO v_cabinet_id;
  ELSE
    UPDATE public.ad_cabinets
    SET
      name = 'Демо Meta · ' || p_project_name,
      type = 'Личный',
      online = true,
      currency = 'USD',
      updated_at = now()
    WHERE id = v_cabinet_id;
  END IF;

  INSERT INTO public.sales_service_catalog (project_id, name, default_price, sort_order, is_active)
  SELECT v_project_id, x.name, x.price, x.ord, true
  FROM (VALUES
    ('Имплантация', 1200::numeric, 1),
    ('Отбеливание', 320::numeric, 2),
    ('Гигиена', 85::numeric, 3),
    ('Брекеты', 2800::numeric, 4),
    ('Коронка', 450::numeric, 5),
    ('Виниры', 650::numeric, 6),
    ('Лечение кариеса', 120::numeric, 7)
  ) AS x(name, price, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.sales_service_catalog s
    WHERE s.project_id = v_project_id AND s.name = x.name
  );

  CREATE TEMP TABLE _demo_leads (
    name text,
    stage_key text,
    phone text,
    meta_ad_id text,
    service_name text,
    amount numeric,
    is_qualified boolean,
    day_offset int,
    reject_reason text
  ) ON COMMIT DROP;

  INSERT INTO _demo_leads VALUES
    ('Айгуль Нурланова',   'new',         '+77011234501', '120884739201', 'Гигиена',       NULL,  NULL,  2,  NULL),
    ('Данияр Касымов',     'new',         '+77011234502', '120884739202', NULL,            NULL,  NULL,  1,  NULL),
    ('Мадина Оспанова',    'new',         '+77011234503', '120884739201', NULL,            NULL,  NULL,  0,  NULL),
    ('Ерлан Сейтжанов',    'no_answer',   '+77011234504', '120884739203', NULL,            NULL,  false, 3,  NULL),
    ('Асель Бекенова',     'no_answer',   '+77011234505', '120884739202', NULL,            NULL,  false, 4,  NULL),
    ('Нурлан Толеуов',     'in_progress', '+77011234506', '120884739201', 'Имплантация',   NULL,  true,  5,  NULL),
    ('Жанар Абдуллаева',   'in_progress', '+77011234507', '120884739203', 'Отбеливание',   NULL,  true,  6,  NULL),
    ('Бауыржан Иманов',    'in_progress', '+77011234508', '120884739201', 'Брекеты',       NULL,  true,  7,  NULL),
    ('Гульнара Садыкова',  'in_progress', '+77011234509', '120884739202', 'Коронка',       NULL,  false, 8,  NULL),
    ('Арман Жумабеков',    'invoice',     '+77011234510', '120884739203', 'Имплантация',   NULL,  true,  9,  NULL),
    ('Сауле Муканова',     'invoice',     '+77011234511', '120884739201', 'Отбеливание',   NULL,  true,  10, NULL),
    ('Камила Рахимова',    'scheduled',   '+77011234512', '120884739202', 'Гигиена',       NULL,  true,  11, NULL),
    ('Тимур Назарбаев',    'scheduled',   '+77011234513', '120884739203', 'Коронка',       NULL,  true,  12, NULL),
    ('Алия Кенжебаева',    'visit',       '+77011234514', '120884739201', 'Брекеты',       NULL,  true,  13, NULL),
    ('Руслан Омаров',      'visit',       '+77011234515', '120884739202', 'Имплантация',   NULL,  true,  14, NULL),
    ('Динара Ермекова',    'paid',        '+77011234516', '120884739201', 'Имплантация',   1200,  true,  15, NULL),
    ('Ерболат Ахметов',    'paid',        '+77011234517', '120884739203', 'Отбеливание',   320,   true,  16, NULL),
    ('Ляззат Байжанова',   'paid',        '+77011234518', '120884739202', 'Гигиена',       85,    true,  17, NULL),
    ('Серик Нуртазин',     'paid',        '+77011234519', '120884739201', 'Коронка',       450,   true,  18, NULL),
    ('Айдана Куанышева',   'rejected',    '+77011234520', '120884739203', NULL,            NULL,  false, 19, 'Дорого'),
    ('Меруерт Тлеуберди',  'rejected',    '+77011234521', '120884739202', 'Брекеты',       NULL,  false, 20, 'Передумал'),
    ('Олжас Касымхан',     'rejected',    '+77011234522', '120884739201', NULL,            NULL,  false, 21, 'Не отвечает');

  FOR rec IN SELECT * FROM _demo_leads ORDER BY day_offset LOOP
    SELECT ps.id INTO v_stage_id
    FROM public.pipeline_stages ps
    WHERE ps.pipeline_id = v_pipeline_id AND ps.key = rec.stage_key
    LIMIT 1;

    IF v_stage_id IS NULL THEN
      RAISE EXCEPTION 'Этап % не найден в воронке проекта', rec.stage_key;
    END IF;

    v_service_id := NULL;
    IF rec.service_name IS NOT NULL THEN
      SELECT id INTO v_service_id
      FROM public.sales_service_catalog
      WHERE project_id = v_project_id AND name = rec.service_name
      LIMIT 1;
    END IF;

    v_created := (v_month_start + rec.day_offset)::timestamptz + interval '10 hours';

    INSERT INTO public.leads (
      pipeline_id, stage_id, project_id, cabinet_id,
      name, phone, source, channel, campaign,
      meta_ad_id, utm, service, service_id,
      amount, is_qualified, is_personal,
      paid, paid_at, rejected_at, reject_reason,
      city, ai_score, note,
      first_touch_at, first_response_at, last_contact_at,
      created_at, updated_at, last_activity_at
    ) VALUES (
      v_pipeline_id, v_stage_id, v_project_id, v_cabinet_id,
      rec.name, rec.phone, v_demo_source, 'whatsapp',
      'Демо-кампания Июль',
      rec.meta_ad_id,
      jsonb_build_object(
        'utm_source', 'facebook',
        'utm_medium', 'cpc',
        'utm_campaign', 'demo_stomatology_july',
        'utm_content', rec.meta_ad_id
      ),
      rec.service_name,
      v_service_id,
      COALESCE(rec.amount, 0),
      rec.is_qualified,
      false,
      rec.stage_key = 'paid',
      CASE WHEN rec.stage_key = 'paid' THEN v_created + interval '2 days' ELSE NULL END,
      CASE WHEN rec.stage_key = 'rejected' THEN v_created + interval '1 day' ELSE NULL END,
      rec.reject_reason,
      'Алматы',
      40 + (rec.day_offset % 50),
      'Демо-лид для презентации ROMI',
      v_created,
      v_created + interval '15 minutes',
      v_created + interval '1 hour',
      v_created,
      v_created,
      v_created + interval '1 hour'
    )
    RETURNING id INTO v_lead_id;

    v_leads_inserted := v_leads_inserted + 1;

    INSERT INTO public.communications (lead_id, type, channel, direction, content, created_at)
    VALUES
      (v_lead_id, 'message', 'whatsapp', 'in',
       'Здравствуйте! Хочу записаться на консультацию.', v_created + interval '5 minutes'),
      (v_lead_id, 'message', 'whatsapp', 'out',
       'Добрый день! Подскажите, какая услуга вас интересует?', v_created + interval '15 minutes');

    v_msgs_inserted := v_msgs_inserted + 2;

    IF rec.stage_key IN ('in_progress', 'invoice', 'paid', 'visit') THEN
      INSERT INTO public.communications (lead_id, type, channel, direction, content, created_at)
      VALUES (
        v_lead_id, 'message', 'whatsapp', 'in',
        'Интересует ' || COALESCE(rec.service_name, 'консультация') || '. Когда можно прийти?',
        v_created + interval '45 minutes'
      );
      v_msgs_inserted := v_msgs_inserted + 1;
    END IF;

    IF rec.stage_key IN ('paid', 'in_progress', 'invoice') THEN
      INSERT INTO public.communications (lead_id, type, content, created_at)
      VALUES (
        v_lead_id, 'note',
        'Клиент заинтересован. Куратор: перезвонить и уточнить бюджет.',
        v_created + interval '2 hours'
      );
      v_notes_inserted := v_notes_inserted + 1;
    END IF;

    IF rec.stage_key IN ('scheduled', 'visit', 'invoice') THEN
      INSERT INTO public.tasks (lead_id, type, title, due_at, status, source, created_at)
      VALUES (
        v_lead_id, 'followup',
        'Перезвонить — ' || rec.name,
        v_created + interval '1 day',
        CASE WHEN rec.stage_key = 'visit' THEN 'done'::task_status ELSE 'pending'::task_status END,
        'demo_seed',
        v_created
      );
      v_tasks_inserted := v_tasks_inserted + 1;
    END IF;

    INSERT INTO public.lead_status_history (lead_id, to_stage_id, changed_at)
    VALUES (v_lead_id, v_stage_id, v_created);

    INSERT INTO public.events (lead_id, event_type, payload, created_at)
    VALUES (
      v_lead_id,
      'lead.demo_seeded',
      jsonb_build_object('stage', rec.stage_key, 'meta_ad_id', rec.meta_ad_id),
      v_created
    );
  END LOOP;

  DELETE FROM public.cabinet_daily_insights
  WHERE cabinet_id = v_cabinet_id
    AND date >= v_month_start - 7;

  FOR v_day IN
    SELECT d::date
    FROM generate_series(v_month_start - 7, CURRENT_DATE, '1 day') AS d
  LOOP
    v_spend := 12 + (extract(day from v_day)::int % 9) * 3.5
             + CASE WHEN extract(dow from v_day)::int IN (0, 6) THEN 4 ELSE 0 END;
    v_meta_leads := CASE
      WHEN extract(day from v_day)::int % 5 = 0 THEN 2
      WHEN extract(day from v_day)::int % 3 = 0 THEN 1
      ELSE 0
    END;

    INSERT INTO public.cabinet_daily_insights (
      cabinet_id, external_id, project_id, date,
      spend, impressions, clicks, leads,
      currency, provider, synced_at
    ) VALUES (
      v_cabinet_id, v_cabinet_ext, v_project_id, v_day,
      round(v_spend::numeric, 2),
      (v_spend * 85)::int,
      greatest(1, (v_spend * 2.2)::int),
      v_meta_leads,
      'USD', 'meta', now()
    )
    ON CONFLICT (cabinet_id, date) DO UPDATE SET
      spend = EXCLUDED.spend,
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      leads = EXCLUDED.leads,
      currency = 'USD',
      synced_at = now();

    v_cdi_days := v_cdi_days + 1;
  END LOOP;

  PERFORM public.reconcile_cdi_for_project(v_project_id, v_month_start - 7);

  INSERT INTO public.finance_plans (project_id, month_key, spend, leads, cpl, visits, sales, revenue, avg_check)
  VALUES (
    v_project_id,
    to_char(CURRENT_DATE, 'YYYY-MM'),
    520, 22, 24, 8, 4, 2055, 514
  )
  ON CONFLICT (project_id, month_key) DO UPDATE SET
    spend = EXCLUDED.spend,
    leads = EXCLUDED.leads,
    sales = EXCLUDED.sales,
    revenue = EXCLUDED.revenue,
    saved_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'project_id', v_project_id,
    'project_name', p_project_name,
    'cabinet_id', v_cabinet_id,
    'leads', v_leads_inserted,
    'messages', v_msgs_inserted,
    'notes', v_notes_inserted,
    'tasks', v_tasks_inserted,
    'cdi_days', v_cdi_days,
    'is_demo', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_project(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_demo_project(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.seed_demo_project(text) IS
  'Заполняет проект демо-данными: CRM, услуги, Meta-расходы, аналитика. Идемпотентно.';
