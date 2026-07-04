-- ROMI-KZ · Lovable → Supabase → SQL Editor
-- WhatsApp → messages, лиды сайта → leads, трафик → только clicks
-- Безопасно запускать повторно

-- 1) meta_campaign_daily по destination / objective / имени
UPDATE public.meta_campaign_daily mcd
SET
  leads = CASE
    WHEN UPPER(COALESCE(mc.destination_type, '')) ~ '(WHATSAPP|MESSENG|MESSAGING|INSTAGRAM_DIRECT)'
      THEN 0
    WHEN UPPER(COALESCE(mc.destination_type, '')) ~ '(WEBSITE|ON_AD|LEAD_FORM|INSTANT_FORM)'
      THEN CASE
        WHEN COALESCE(mcd.messages, 0) > 0 AND mcd.leads >= mcd.messages
          THEN mcd.leads - mcd.messages
        ELSE mcd.leads
      END
    WHEN UPPER(COALESCE(mc.objective, '')) ~ 'TRAFFIC|LINK_CLICK'
      THEN 0
    WHEN UPPER(COALESCE(mc.objective, '')) ~ 'MESSAGE|CONVERSATION'
      OR (UPPER(COALESCE(mc.objective, '')) ~ 'ENGAGEMENT' AND UPPER(COALESCE(mc.objective, '')) !~ 'LEAD')
      THEN 0
    WHEN LOWER(COALESCE(mc.name, '')) ~ 'whats?app|\\mwa\\M|вотсап|ватсап|сообщен'
      THEN 0
    WHEN LOWER(COALESCE(mc.name, '')) ~ 'сайт|site|лендинг|landing|pixel|пиксель|форм'
      THEN mcd.leads
    WHEN LOWER(COALESCE(mc.name, '')) ~ 'трафик|traffic|клик|click'
      THEN 0
    -- без метаданных: старый sync клал WA в leads
    WHEN COALESCE(mcd.messages, 0) = 0 AND COALESCE(mcd.leads, 0) > 0
      THEN 0
    WHEN COALESCE(mcd.messages, 0) > 0 AND mcd.leads >= mcd.messages
      THEN mcd.leads - mcd.messages
    ELSE mcd.leads
  END,
  messages = CASE
    WHEN UPPER(COALESCE(mc.destination_type, '')) ~ '(WHATSAPP|MESSENG|MESSAGING|INSTAGRAM_DIRECT)'
      THEN GREATEST(COALESCE(mcd.messages, 0), COALESCE(mcd.leads, 0))
    WHEN UPPER(COALESCE(mc.destination_type, '')) ~ '(WEBSITE|ON_AD|LEAD_FORM|INSTANT_FORM)'
      THEN 0
    WHEN UPPER(COALESCE(mc.objective, '')) ~ 'TRAFFIC|LINK_CLICK'
      THEN 0
    WHEN UPPER(COALESCE(mc.objective, '')) ~ 'MESSAGE|CONVERSATION'
      OR (UPPER(COALESCE(mc.objective, '')) ~ 'ENGAGEMENT' AND UPPER(COALESCE(mc.objective, '')) !~ 'LEAD')
      THEN GREATEST(COALESCE(mcd.messages, 0), COALESCE(mcd.leads, 0))
    WHEN LOWER(COALESCE(mc.name, '')) ~ 'whats?app|\\mwa\\M|вотсап|ватсап|сообщен'
      THEN GREATEST(COALESCE(mcd.messages, 0), COALESCE(mcd.leads, 0))
    WHEN LOWER(COALESCE(mc.name, '')) ~ 'сайт|site|лендинг|landing|pixel|пиксель|форм'
      THEN 0
    WHEN LOWER(COALESCE(mc.name, '')) ~ 'трафик|traffic|клик|click'
      THEN 0
    WHEN COALESCE(mcd.messages, 0) = 0 AND COALESCE(mcd.leads, 0) > 0
      THEN mcd.leads
    ELSE COALESCE(mcd.messages, 0)
  END
FROM public.meta_campaigns mc
WHERE mc.campaign_id = mcd.campaign_id;

-- 2) CDI без привязки к кампаниям: leads → messages (типичный старый баг)
UPDATE public.cabinet_daily_insights
SET
  messages = CASE
    WHEN COALESCE(messages, 0) = 0 AND COALESCE(leads, 0) > 0 THEN leads
    WHEN COALESCE(messages, 0) > 0 AND leads >= messages THEN messages
    ELSE messages
  END,
  leads = CASE
    WHEN COALESCE(messages, 0) = 0 AND COALESCE(leads, 0) > 0 THEN 0
    WHEN COALESCE(messages, 0) > 0 AND leads >= messages THEN leads - messages
    ELSE leads
  END
WHERE COALESCE(messages, 0) = 0 AND COALESCE(leads, 0) > 0
   OR (COALESCE(messages, 0) > 0 AND leads >= messages);

-- 3) Пересчёт CDI из кампаний (если есть meta_campaign_daily)
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

-- После SQL: обновите страницу. Для новых данных — «Получить статистику».
