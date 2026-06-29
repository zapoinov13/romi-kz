#!/usr/bin/env bash
# Одноразовый деплой на https://romi-agency.vercel.app
# Требует: vercel login (один раз) и доступ к проекту romi-agency.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v vercel >/dev/null 2>&1; then
  echo "Установите CLI: npm i -g vercel"
  exit 1
fi

echo "→ Если ещё не логинились: vercel login"
echo "→ При link выберите существующий проект romi-agency (или создайте новый)"
echo ""

if [[ ! -f .vercel/project.json ]]; then
  echo "Привязка к проекту Vercel..."
  npx vercel@latest link
fi

echo "Сборка и деплой в production..."
npx vercel@latest deploy --prod

echo ""
echo "Проверка:"
echo "  curl -s https://romi-agency.vercel.app/lovable-sync.json | jq .git_sha"
