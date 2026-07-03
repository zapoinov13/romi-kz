-- CRM enhancements: этапы, причины отказов, синхронизация с аналитикой продаж
-- Безопасно запускать повторно

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_qualified boolean;

-- Названия этапов по ТЗ
UPDATE public.pipeline_stages SET title = 'Новая' WHERE key = 'new';
UPDATE public.pipeline_stages SET title = 'Без ответа' WHERE key = 'no_answer';
UPDATE public.pipeline_stages SET title = 'В работе' WHERE key = 'in_progress';
UPDATE public.pipeline_stages SET title = 'Счёт отправлен' WHERE key = 'invoice';
UPDATE public.pipeline_stages SET title = 'Визит назначен' WHERE key = 'scheduled';
UPDATE public.pipeline_stages SET title = 'Визит совершен' WHERE key = 'visit';
UPDATE public.pipeline_stages SET title = 'Счёт оплачен' WHERE key = 'paid';
UPDATE public.pipeline_stages SET title = 'Отказ' WHERE key = 'rejected';

-- Причины отказов по ТЗ (добавляем недостающие)
INSERT INTO public.loss_reasons (key, label, emoji, order_index)
VALUES
  ('no_need', 'Нет потребности', '🚫', 6),
  ('no_budget', 'Нет бюджета', '💳', 7),
  ('wrong_lead', 'Ошибочная заявка', '⚠️', 8)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  emoji = EXCLUDED.emoji,
  order_index = EXCLUDED.order_index;

UPDATE public.loss_reasons SET label = 'Не выходит на связь', emoji = '📵' WHERE key = 'no_contact';
UPDATE public.loss_reasons SET label = 'Купил у конкурентов', emoji = '🏃' WHERE key = 'competitor';

-- Синхронизация CRM → sales_analytics_leads (квал, оплата, услуга, сумма)
CREATE OR REPLACE FUNCTION public.sync_sales_analytics_from_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stage_key text;
  _qualified boolean;
  _payment text;
  _service_id uuid;
  _amount numeric;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ps.key INTO _stage_key
  FROM public.pipeline_stages ps
  WHERE ps.id = NEW.stage_id;

  IF NEW.is_qualified IS NOT NULL THEN
    _qualified := NEW.is_qualified;
  ELSIF _stage_key IN ('in_progress', 'invoice', 'scheduled', 'visit', 'paid') THEN
    _qualified := true;
  ELSIF _stage_key IN ('rejected', 'no_answer') THEN
    _qualified := false;
  ELSE
    _qualified := NULL;
  END IF;

  IF NEW.paid = true THEN
    _payment := 'paid';
    _amount := NULLIF(NEW.amount, 0);
  ELSIF _stage_key = 'rejected' THEN
    _payment := 'unpaid';
    _amount := NULL;
  ELSE
    _payment := NULL;
    _amount := NULL;
  END IF;

  _service_id := NULL;
  IF NULLIF(TRIM(NEW.service), '') IS NOT NULL THEN
    SELECT s.id INTO _service_id
    FROM public.sales_service_catalog s
    WHERE s.project_id = NEW.project_id
      AND lower(trim(s.name)) = lower(trim(NEW.service))
    LIMIT 1;
  END IF;

  INSERT INTO public.sales_analytics_leads (
    project_id, lead_id, cabinet_id, name, phone, source_label,
    meta_ad_id, utm_content, utm_source, utm_medium, utm_campaign,
    channel, is_qualified, payment_status, service_id, amount, created_at
  ) VALUES (
    NEW.project_id,
    NEW.id,
    NEW.cabinet_id,
    COALESCE(NULLIF(TRIM(NEW.name), ''), '—'),
    COALESCE(NULLIF(TRIM(NEW.phone), ''), '—'),
    public.build_sales_source_label(
      NEW.meta_ad_id, NEW.utm, NEW.campaign, NEW.source, NEW.channel::text
    ),
    NULLIF(TRIM(NEW.meta_ad_id), ''),
    NULLIF(TRIM(NEW.utm->>'utm_content'), ''),
    NULLIF(TRIM(NEW.utm->>'utm_source'), ''),
    NULLIF(TRIM(NEW.utm->>'utm_medium'), ''),
    NULLIF(TRIM(NEW.utm->>'utm_campaign'), ''),
    NEW.channel::text,
    _qualified,
    _payment,
    _service_id,
    _amount,
    COALESCE(NEW.first_touch_at, NEW.created_at, now())
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    cabinet_id = COALESCE(EXCLUDED.cabinet_id, sales_analytics_leads.cabinet_id),
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    source_label = EXCLUDED.source_label,
    meta_ad_id = COALESCE(EXCLUDED.meta_ad_id, sales_analytics_leads.meta_ad_id),
    utm_content = COALESCE(EXCLUDED.utm_content, sales_analytics_leads.utm_content),
    utm_source = COALESCE(EXCLUDED.utm_source, sales_analytics_leads.utm_source),
    utm_medium = COALESCE(EXCLUDED.utm_medium, sales_analytics_leads.utm_medium),
    utm_campaign = COALESCE(EXCLUDED.utm_campaign, sales_analytics_leads.utm_campaign),
    channel = COALESCE(EXCLUDED.channel, sales_analytics_leads.channel),
    is_qualified = COALESCE(EXCLUDED.is_qualified, sales_analytics_leads.is_qualified),
    payment_status = COALESCE(EXCLUDED.payment_status, sales_analytics_leads.payment_status),
    service_id = COALESCE(EXCLUDED.service_id, sales_analytics_leads.service_id),
    amount = COALESCE(EXCLUDED.amount, sales_analytics_leads.amount),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sales_analytics_from_lead ON public.leads;
CREATE TRIGGER trg_sync_sales_analytics_from_lead
  AFTER INSERT OR UPDATE OF
    name, phone, meta_ad_id, utm, campaign, source, channel, project_id, cabinet_id,
    stage_id, paid, amount, service, is_qualified
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_sales_analytics_from_lead();

-- Внутренние комментарии CRM: type = note в communications
COMMENT ON TABLE public.communications IS 'type: call|message|note — note только для внутренних комментариев CRM';
