-- Квалифицированные лиды per cabinet/day (ручной ввод + опционально CRM позже)
ALTER TABLE public.cabinet_daily_insights
  ADD COLUMN IF NOT EXISTS crm_qualified integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_qualified integer;

COMMENT ON COLUMN public.cabinet_daily_insights.manual_qualified IS
  'NULL = авто из CRM; число = ручная корректировка квал-лидов за день';
