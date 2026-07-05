-- Lovable SQL Editor: cron_secret для pg_cron (meta-leads-sync и др.)
-- Выполнить один раз. Сохраните значение — понадобится для ручных curl-тестов.

UPDATE public.automation_settings
   SET cron_secret = encode(gen_random_bytes(32), 'hex'),
       updated_at = now()
 WHERE id = true
   AND (cron_secret IS NULL OR btrim(cron_secret) = '');

-- Проверка (секрет не показывается клиентам — только admin/service):
SELECT cron_secret_present FROM public.automation_settings WHERE id = true;
