#!/usr/bin/env bash
# Деплой ads-telegram-webhook на прод ROMI (rgttklitvvqsnlsakvzr).
# Требует SUPABASE_ACCESS_TOKEN с доступом к Lovable-проекту.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_REF="${SUPABASE_PROJECT_REF:-rgttklitvvqsnlsakvzr}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: export SUPABASE_ACCESS_TOKEN=sbp_..." >&2
  echo "Токен: https://supabase.com/dashboard/account/tokens" >&2
  echo "Должен иметь доступ к проекту $PROJECT_REF (Lovable → Project Settings → Supabase)." >&2
  exit 1
fi

cd "$ROOT"
echo "Deploying ads-telegram-webhook → $PROJECT_REF"
supabase functions deploy ads-telegram-webhook \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo "Done. Проверка: отправь боту «запусти на ватсап» с фото."
echo "Новая ошибка (если поля пусты) начинается с «не хватает данных для запуска» — не со старого текста."
