-- Если webhook настроен вручную в Green API Console (URL ROMI, без webhookUrlToken),
-- сбросьте токен ROMI — иначе greenapi-webhook отклоняет входящие (401).
-- Замените id_instance на свой (например 7107618939).

UPDATE public.whatsapp_config
   SET webhook_token = NULL,
       updated_at = now()
 WHERE id_instance = '7107618939';
