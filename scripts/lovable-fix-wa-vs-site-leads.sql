-- ROMI-KZ · Lovable → Supabase → SQL Editor
-- Разложить WhatsApp и лиды сайта по правильным колонкам
-- (Meta часто пишет переписки в lead; старый sync клал messages в leads)
-- Безопасно запускать повторно

-- 1) meta_campaign_daily: по destination кампании
UPDATE public.meta_campaign_daily mcd
SET
  leads = CASE
    WHEN UPPER(COALESCE(mc.destination_type, '')) ~ '(WHATSAPP|MESSENG|MESSAGING|INSTAGRAM_DIRECT)'
      THEN 0
    WHEN COALESCE(mcd.messages, 0) > 0 AND mcd.leads >= mcd.messages
      THEN mcd.leads - mcd.messages
    ELSE mcd.leads
  END,
  messages = CASE
    WHEN UPPER(COALESCE(mc.destination_type, '')) ~ '(WHATSAPP|MESSENG|MESSAGING|INSTAGRAM_DIRECT)'
      THEN GREATEST(COALESCE(mcd.messages, 0), COALESCE(mcd.leads, 0))
    ELSE COALESCE(mcd.messages, 0)
  END
FROM public.meta_campaigns mc
WHERE mc.campaign_id = mcd.campaign_id;

-- 2) cabinet_daily_insights: пересчёт из кампаний (если есть meta_campaign_daily)
UPDATE public.cabinet_daily_insights cdi
SET
  leads = COALESCE(sub.leads, 0),
  messages = COALESCE(sub.messages, 0)
FROM (
  SELECT
    mcd.cabinet_id,
    mcd.date,
    SUM(mcd.leads)::int AS leads,
    SUM(mcd.messages)::int AS messages
  FROM public.meta_campaign_daily mcd
  GROUP BY mcd.cabinet_id, mcd.date
) sub
WHERE cdi.cabinet_id = sub.cabinet_id
  AND cdi.date = sub.date;

-- После SQL: в «Управление рекламой» нажмите «Получить статистику»
-- за нужный период — sync уже пишет колонки правильно.
