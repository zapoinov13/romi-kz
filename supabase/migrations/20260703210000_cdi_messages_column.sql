-- Meta Ads: клики ≠ лиды ≠ сообщения
-- leads    = лид-формы / pixel lead
-- messages = начатые переписки (WhatsApp / Messenger)
-- clicks   = клики по объявлению (трафик)

ALTER TABLE public.cabinet_daily_insights
  ADD COLUMN IF NOT EXISTS messages integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.cabinet_daily_insights.leads IS
  'Лиды Meta: формы / pixel lead. Не включает сообщения и клики.';
COMMENT ON COLUMN public.cabinet_daily_insights.messages IS
  'Начатые переписки Meta (messaging_conversation_started). Отдельно от лид-форм.';
COMMENT ON COLUMN public.cabinet_daily_insights.clicks IS
  'Клики по объявлению. Не лиды.';

-- Backfill из meta_campaign_daily (если есть детализация по кампаниям)
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
