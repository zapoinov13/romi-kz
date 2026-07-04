-- Lovable → SQL Editor: переименовать лиды с метками из телефонной книги → номер телефона.
-- Затем задеploy greenapi-proxy + greenapi-sync-name и откройте чат — подтянется имя из WhatsApp getContactInfo.
-- Или: SUPABASE_SERVICE_ROLE_KEY=... ./scripts/sync-wa-lead-names.sh <project_id>

UPDATE public.leads
   SET name = phone
 WHERE channel = 'whatsapp'
   AND lower(btrim(name)) IN (
     'муж', 'жена', 'wife', 'husband', 'мама', 'папа', 'mom', 'dad',
     'брат', 'сестра', 'bro', 'sis', 'brother', 'sister', 'друг', 'подруга',
     'клиент', 'client', 'customer', 'заказчик', 'пациент', 'patient'
   );

-- Проверка: последние WA-лиды
SELECT id, name, phone, project_id, updated_at
  FROM public.leads
 WHERE channel = 'whatsapp'
 ORDER BY created_at DESC
 LIMIT 10;
