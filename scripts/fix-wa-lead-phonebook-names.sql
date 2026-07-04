-- Lovable → SQL Editor: переименовать лиды с метками из телефонной книги → номер телефона.
-- После этого при новом сообщении подтянется имя из WhatsApp (если Green API его отдаёт).

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
