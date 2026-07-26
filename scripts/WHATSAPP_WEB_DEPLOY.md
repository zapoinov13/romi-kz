# WhatsApp Web (Baileys) → CRM — чеклист деплоя ROMI

Без Green API и без Meta Cloud. QR как WhatsApp Web.
**Service role не нужен** — bridge пишет через SQL RPC `wa_web_worker`.

## 1. SQL (обязательно)

Lovable → Cloud → SQL Editor → выполнить весь файл:

[`scripts/lovable-whatsapp-web.sql`](./lovable-whatsapp-web.sql)

(внутри уже есть таблицы + RPC + worker key)

## 2. Секреты Vercel

Project **romi-kz** → Settings → Environment Variables:

| Name | Value |
|------|--------|
| `WA_WEB_WORKER_KEY` | `e408a3c4adb7509cdf0a05b32ddcd50c85ec105b72026a04cf260229b02f473b` |
| `VITE_SUPABASE_URL` | уже есть |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | уже есть |

`SUPABASE_SERVICE_ROLE_KEY` **не требуется**.

После добавления — Redeploy.

Bridge URL: `https://romi-kz.vercel.app/api/wa-web-bridge`

## 3. VPS daemon (отдельно от MarkVision `wa-web`)

На Hostinger уже крутится MarkVision — **не трогать**. ROMI:

```bash
# /opt/romi-wa-web
export WA_WEB_WORKER_KEY='e408a3c4adb7509cdf0a05b32ddcd50c85ec105b72026a04cf260229b02f473b'
export WA_WEB_BRIDGE_URL='https://romi-kz.vercel.app/api/wa-web-bridge'
pm2 start daemon.mjs --name romi-wa-web
pm2 save
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

Неофициальный клиент (Baileys) — аккаунт могут ограничить. Сессии лежат в `sessions/` на VPS.
