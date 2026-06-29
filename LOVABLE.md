# Деплой ROMI (фронт)

## Главная ссылка

**Прод:** https://romi-kz.vercel.app/

> Старый URL `romi-agency.vercel.app` — другой Vercel-аккаунт (`stdentalmarketing`), **не обновляется**. Используйте **romi-kz.vercel.app**.

Код: **zapoinov13/romi-kz**, ветка **main**.

## Как выкатить обновления

### Вариант 1 — автоматически (рекомендуется)

1. Push в `main` на GitHub.
2. GitHub Action **Vercel Production Deploy** собирает и выкладывает на `romi-agency.vercel.app`.
3. Проверка: https://romi-agency.vercel.app/lovable-sync.json — `git_sha` должен совпадать с последним коммитом.

**Секреты в GitHub** (Settings → Secrets → Actions):

| Secret | Где взять |
|--------|-----------|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Vercel → Team Settings → General |
| `VERCEL_PROJECT_ID` | Проект **romi-agency** → Settings → General |

### Вариант 2 — вручную в Vercel

1. [vercel.com](https://vercel.com) → проект **romi-agency**
2. **Settings → Git** — репозиторий `zapoinov13/romi-kz`, ветка `main`
3. **Deployments → Redeploy** (последний коммит)

### Lovable (опционально, не для Vercel)

Lovable **не деплоит** на `romi-agency.vercel.app`. Кнопка Publish выкладывает только на `*.lovable.app`.

Если всё же используете редактор Lovable:

1. **Project settings → Git** — подключите **`zapoinov13/romi-kz`** (не `MarkVision2/markvision-a1`), ветка `main`.
2. Дождитесь sync, затем **Publish → Update** для preview на lovable.app.

## Проверка версии в приложении

**Настройки → Деплой** — коммит и дата из `lovable-sync.json`.

## Supabase (Meta, CRM)

Фронт на Vercel, бэкенд — Supabase **`rgttklitvvqsnlsakvzr`**.

Edge Functions и секреты (`META_APP_ID`, …) — в Dashboard этого проекта, не в Lovable Publish.
