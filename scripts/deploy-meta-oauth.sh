#!/usr/bin/env bash
# Деплой Facebook OAuth + meta-connect на прод ROMI (rgttklitvvqsnlsakvzr).
# Требует: SUPABASE_ACCESS_TOKEN с доступом к проекту.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-rgttklitvvqsnlsakvzr}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: export SUPABASE_ACCESS_TOKEN=<token from supabase.com/dashboard/account/tokens>"
  exit 1
fi

cd "$(dirname "$0")/.."
CLI=(npx supabase@latest)

echo "Project: $PROJECT_REF"
echo "1/4 meta-oauth-start"
"${CLI[@]}" functions deploy meta-oauth-start --project-ref "$PROJECT_REF"

echo "2/4 meta-oauth-callback (no JWT — Facebook redirect)"
"${CLI[@]}" functions deploy meta-oauth-callback --project-ref "$PROJECT_REF" --no-verify-jwt

echo "3/4 meta-connect-token"
"${CLI[@]}" functions deploy meta-connect-token --project-ref "$PROJECT_REF"

echo "4/4 meta-list-ad-accounts"
"${CLI[@]}" functions deploy meta-list-ad-accounts --project-ref "$PROJECT_REF"

echo ""
echo "Done. Also run SQL migration in Dashboard → SQL Editor:"
echo "  supabase/migrations/20260627120000_meta_oauth.sql"
echo ""
echo "Set Edge Function secrets (Dashboard → Edge Functions → Secrets):"
echo "  META_APP_ID, META_APP_SECRET, FRONTEND_URL=https://romi-agency.vercel.app"
