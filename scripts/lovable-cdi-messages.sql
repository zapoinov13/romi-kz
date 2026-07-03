-- ROMI-KZ · Lovable → Supabase → SQL Editor
-- Разделение Meta: клики / сообщения / лиды (формы)
-- Безопасно запускать повторно

ALTER TABLE public.cabinet_daily_insights
  ADD COLUMN IF NOT EXISTS messages integer NOT NULL DEFAULT 0;

UPDATE public.cabinet_daily_insights cdi
SET
  messages = COALESCE(sub.msg, 0),
  leads = GREATEST(cdi.leads - COALESCE(sub.msg, 0), 0)
FROM (
  SELECT cabinet_id, date, SUM(messages)::int AS msg
  FROM public.meta_campaign_daily
  GROUP BY cabinet_id, date
) sub
WHERE cdi.cabinet_id = sub.cabinet_id
  AND cdi.date = sub.date
  AND sub.msg > 0
  AND cdi.messages = 0;

-- После SQL: в «Управление рекламой» нажмите «Получить статистику» за нужный период
