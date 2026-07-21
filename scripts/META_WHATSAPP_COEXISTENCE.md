# Meta WhatsApp Business Coexistence — checklist для продакшена

## Secrets (Supabase Edge Functions)

| Secret | Назначение |
|--------|------------|
| `META_APP_ID` | Facebook App ID |
| `META_APP_SECRET` | App Secret (подпись webhook + token exchange) |
| `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` | Config ID из Meta App → WhatsApp → Embedded Signup |
| `META_WA_WEBHOOK_VERIFY_TOKEN` | Произвольная строка для hub.verify_token |
| `META_APP_WEBHOOK_SECRET` | Обычно = App Secret; для X-Hub-Signature-256 |
| `META_GRAPH_VERSION` | опционально, по умолчанию `v21.0` |

## Meta App

1. Статус **Tech Provider** или **Solution Partner**
2. Advanced Access: `whatsapp_business_management`, `whatsapp_business_messaging`
3. WhatsApp product + Embedded Signup configuration с Coexistence / WhatsApp Business App onboarding
4. Webhook callback URL:
   `https://rgttklitvvqsnlsakvzr.supabase.co/functions/v1/wa-cloud-webhook`
5. Подписки webhook: `messages`, `smb_message_echoes`, `smb_app_state_sync` (history — опционально, v1 не используем)
6. Allowed domains / Valid OAuth redirect URIs: `https://romi-kz.vercel.app`

## SQL

Выполнить миграцию:

`supabase/migrations/20260721080000_whatsapp_accounts_coexistence.sql`

или скрипт `scripts/lovable-whatsapp-coexistence.sql`.

## Edge Functions

```bash
npx supabase functions deploy wa-cloud-webhook --project-ref rgttklitvvqsnlsakvzr --no-verify-jwt
npx supabase functions deploy wa-embedded-config --project-ref rgttklitvvqsnlsakvzr
npx supabase functions deploy wa-complete --project-ref rgttklitvvqsnlsakvzr
npx supabase functions deploy wa-status --project-ref rgttklitvvqsnlsakvzr
npx supabase functions deploy wa-disconnect --project-ref rgttklitvvqsnlsakvzr
npx supabase functions deploy wa-send --project-ref rgttklitvvqsnlsakvzr
```

## Приёмка

1. Настройки → WhatsApp → выбрать проект и кабинет
2. «Подключить WhatsApp Business» → QR в приложении
3. Написать на номер с другого телефона → лид в CRM «Новая»
4. Повторное сообщение → то же карточка, новое сообщение
5. Ответ из WhatsApp Business App → сообщение в существующем лиде (без нового)
