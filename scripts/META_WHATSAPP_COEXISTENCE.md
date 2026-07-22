# WhatsApp → CRM через QR (официальный Meta, без Green API)

Цель: в WhatsApp Business App сканируете QR → номер привязан к проекту ROMI → все новые входящие сразу создают/обновляют лида в CRM на этапе **«Новая»**.

Стороних сервисов нет. Только Meta Cloud API (Coexistence) + ваш Supabase.

Проект приложения: **`rgttklitvvqsnlsakvzr`**  
Webhook URL:  
`https://rgttklitvvqsnlsakvzr.supabase.co/functions/v1/wa-cloud-webhook`

---

## Статус кода (уже в репозитории)

| Часть | Статус |
|-------|--------|
| UI: Настройки → WhatsApp | готово |
| Edge: `wa-cloud-webhook`, `wa-embedded-config`, `wa-complete`, `wa-status`, `wa-disconnect`, `wa-send` | готово в коде |
| SQL: `whatsapp_accounts` + RPC bind/unbind | готово в `scripts/lovable-whatsapp-coexistence.sql` |
| CRM: входящие → этап `new`, echo из приложения → только в существующий лид | готово в коде |

Что нужно **включить на проде** (ниже по шагам): SQL → secrets → deploy edges → Meta App → QR.

---

## Шаг 1. SQL (обязательно)

В **Lovable → Cloud → SQL Editor** (проект romi / `rgttklitvvqsnlsakvzr`) выполнить весь файл:

`scripts/lovable-whatsapp-coexistence.sql`

Проверка: в Table Editor должна появиться таблица `whatsapp_accounts` и view `whatsapp_accounts_safe`.

---

## Шаг 2. Secrets Edge Functions

Supabase Dashboard → Project Settings → Edge Functions → Secrets  
(или Lovable → Cloud → Secrets), либо скрипт `scripts/set-meta-whatsapp-secrets.sh`:

| Secret | Что поставить |
|--------|----------------|
| `META_APP_ID` | `3006883863036605` |
| `META_APP_SECRET` | App Secret (только в Dashboard / env — **не в git**) |
| `META_APP_WEBHOOK_SECRET` | = App Secret |
| `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` | Config ID из Meta → WhatsApp → Configuration → Embedded Signup |
| `META_WA_WEBHOOK_VERIFY_TOKEN` | Любая длинная строка (придумайте сами, сохраните) |
| `META_GRAPH_VERSION` | опционально, по умолчанию `v21.0` |

### URL для публикации приложения в Facebook / Meta

Вставьте в настройки приложения (App Settings → Basic / App Review):

| Поле Meta | URL |
|-----------|-----|
| Privacy Policy URL | https://romi-kz.vercel.app/privacy |
| Terms of Service URL | https://romi-kz.vercel.app/terms |

Алиасы (то же содержимое): `/privacy-policy`, `/terms-of-service`.

---

## Шаг 3. Deploy Edge Functions

Нужен Personal Access Token с доступом к проекту Lovable/`rgttklitvvqsnlsakvzr`:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...   # https://supabase.com/dashboard/account/tokens
bash scripts/deploy-whatsapp-coexistence.sh
```

Скрипт задеплоит:

1. `wa-cloud-webhook` **без JWT** (Meta стучится напрямую)
2. `wa-embedded-config`
3. `wa-complete`
4. `wa-status`
5. `wa-disconnect`
6. `wa-send`

Проверка:

```bash
curl -s "https://rgttklitvvqsnlsakvzr.supabase.co/functions/v1/wa-cloud-webhook"
# ожидаем JSON вида {"ok":true,...}, НЕ 404
```

---

## Шаг 4. Meta App (без этого QR не откроется)

1. [developers.facebook.com](https://developers.facebook.com) → ваше приложение
2. Продукт **WhatsApp**
3. Статус аккаунта: **Tech Provider** или **Solution Partner**  
   (обычный Developer без этого статуса **не может** пройти Coexistence / QR Business App)
4. **Advanced Access**: `whatsapp_business_management`, `whatsapp_business_messaging`
5. **Embedded Signup** configuration:
   - тип / feature: WhatsApp Business App onboarding (Coexistence)
   - скопировать **Config ID** → в secret `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`
6. **Webhooks** (на уровне WhatsApp / WABA):
   - Callback URL: `https://rgttklitvvqsnlsakvzr.supabase.co/functions/v1/wa-cloud-webhook`
   - Verify token: тот же, что в `META_WA_WEBHOOK_VERIFY_TOKEN`
   - Подписки: `messages`, `smb_message_echoes`, `smb_app_state_sync`
7. **App Domains / OAuth**:
   - `romi-kz.vercel.app`
   - Valid OAuth Redirect URIs для Facebook Login (если просит Meta)

---

## Шаг 5. Подключение в ROMI

1. Открыть https://romi-kz.vercel.app → **Настройки → WhatsApp**
2. Выбрать **проект** и **рекламный кабинет**
3. **Подключить WhatsApp Business**
4. В окне Meta выбрать подключение WhatsApp Business **приложения**
5. В телефоне открыть WhatsApp Business → отсканировать **QR**
6. Дождаться статуса «Подключён» и номера

---

## Как сообщения попадают в CRM

```
Клиент пишет на ваш номер
    → Meta webhook → wa-cloud-webhook
    → найти кабинет по phone_number_id
    → найти/создать лида (source=whatsapp, этап «Новая»)
    → записать сообщение в communications
```

Правила:

- Новый номер → новый лид в этапе **«Новая»** выбранного проекта
- Повторный номер → только новое сообщение в ту же карточку
- Сообщение, отправленное из WhatsApp Business App (`smb_message_echoes`) → пишется в существующий лид, **новый лид не создаётся**
- Группы игнорируются

Ответ из CRM идёт через `wa-send` (Cloud API), без Green API.

---

## Быстрая приёмка

1. Написать на подключённый номер с другого телефона  
2. В CRM появился лид на этапе «Новая» с текстом сообщения  
3. Второе сообщение → та же карточка  
4. Ответ из WhatsApp Business App → исходящее в ленте лида  
5. Ответ из CRM → клиент получил в WhatsApp

---

## Если что-то не работает

| Симптом | Что проверить |
|---------|----------------|
| 404 на `wa-cloud-webhook` | Шаг 3 — функции не задеплоены |
| Ошибка таблицы / PGRST205 | Шаг 1 — SQL не выполнен |
| «Embedded Signup ещё не настроен» | Нет `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` или `META_APP_ID` |
| QR / окно Meta не даёт Business App | Нет Tech Provider / Advanced Access |
| Webhook verification failed | Не совпал verify token |
| Сообщения не в CRM | Нет подписки `messages` или номер не привязан (статус «Не подключён») |
`)
