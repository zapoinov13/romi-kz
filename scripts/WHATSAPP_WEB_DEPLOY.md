# WhatsApp Web (Baileys) → CRM — чеклист деплоя ROMI

Без Green API и без Meta Cloud. QR как WhatsApp Web.

## 1. SQL (обязательно)

Lovable → Cloud → SQL Editor → выполнить весь файл:

[`scripts/lovable-whatsapp-web.sql`](./lovable-whatsapp-web.sql)

Появятся: `whatsapp_web_sessions`, `whatsapp_web_commands`, `leads.whatsapp_lid`, media-поля в `communications`, bucket `crm-chat-media`.

## 2. Секреты Vercel

Project **romi-kz** → Settings → Environment Variables:

| Name | Value |
|------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | service_role из Lovable Cloud → Database / API |
| `WA_WEB_WORKER_KEY` | длинная случайная строка (одинаковая на VPS) |
| `VITE_SUPABASE_URL` | уже есть (`https://rgttklitvvqsnlsakvzr.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | уже есть |

После добавления — Redeploy.

Bridge URL: `https://romi-kz.vercel.app/api/wa-web-bridge`

## 3. VPS daemon

См. [`wa-web/README.md`](../wa-web/README.md):

```bash
cd wa-web && npm install
export WA_WEB_WORKER_KEY='...'
export WA_WEB_BRIDGE_URL='https://romi-kz.vercel.app/api/wa-web-bridge'
pm2 start daemon.mjs --name wa-web
```

Нужны Node 20+ и `ffmpeg`.

## 4. UI

Настройки → WhatsApp → проект → «Показать QR» → скан в WhatsApp.

Worker должен быть **online** (heartbeat &lt; 90 сек).

## 5. Приёмка

1. QR → статус Connected + номер  
2. Входящее с другого телефона → лид «Новая» + сообщение в чате  
3. Ответ из CRM → уходит через daemon  
4. Голосовое → m4a (если ffmpeg на VPS)

## Риски

Неофициальный клиент (Baileys) — аккаунт могут ограничить. Сессии лежат в `wa-web/sessions/` на VPS.
