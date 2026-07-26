# ROMI WhatsApp Web daemon (Baileys)

QR как WhatsApp Web → сообщения в CRM. Без Green API / Meta Cloud.

## Требования

- Node.js 20+
- `ffmpeg` (голосовые Opus → M4A для Safari)
- `pm2` (рекомендуется)

## Установка на VPS

```bash
cd /opt/romi-wa-web   # или клон репо → wa-web/
cp -r /path/to/romi-kz/wa-web .
cd wa-web
npm install

export WA_WEB_WORKER_KEY='длинный-секрет'
export WA_WEB_BRIDGE_URL='https://romi-kz.vercel.app/api/wa-web-bridge'

# опционально
# export WA_WEB_POLL_MS=2500
# export LOG_LEVEL=info

pm2 start daemon.mjs --name wa-web
pm2 save
```

Сессии Baileys: `sessions/<projectId>/` — бэкапьте, иначе снова QR.

## Секреты на Vercel

| Secret | Назначение |
|--------|------------|
| `WA_WEB_WORKER_KEY` | тот же ключ, что у daemon |
| `SUPABASE_SERVICE_ROLE_KEY` | запись в БД Lovable `rgtt…` |
| `VITE_SUPABASE_URL` | уже есть |

## SQL

В Lovable SQL Editor выполнить: `scripts/lovable-whatsapp-web.sql`

## UI

Настройки → WhatsApp → «Показать QR» → скан в WhatsApp → Connected.

## Проверка

1. Daemon online (heartbeat < 90с в карточке)
2. QR → скан
3. Входящее с другого телефона → лид CRM «Новая» + сообщение
