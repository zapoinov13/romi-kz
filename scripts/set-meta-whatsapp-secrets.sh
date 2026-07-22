#!/usr/bin/env bash
# Set Meta App secrets for WhatsApp Coexistence on ROMI prod.
# NEVER commit real secrets. Pass via env or interactive prompt.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-rgttklitvvqsnlsakvzr}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: export SUPABASE_ACCESS_TOKEN=sbp_... (токен с доступом к Lovable-проекту $PROJECT_REF)"
  exit 1
fi

META_APP_ID="${META_APP_ID:-}"
META_APP_SECRET="${META_APP_SECRET:-}"
WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID="${WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID:-}"
META_WA_WEBHOOK_VERIFY_TOKEN="${META_WA_WEBHOOK_VERIFY_TOKEN:-}"

if [[ -z "$META_APP_ID" || -z "$META_APP_SECRET" ]]; then
  echo "ERROR: export META_APP_ID=... META_APP_SECRET=..."
  exit 1
fi

if [[ -z "$META_WA_WEBHOOK_VERIFY_TOKEN" ]]; then
  META_WA_WEBHOOK_VERIFY_TOKEN="romi_wa_verify_$(openssl rand -hex 12)"
  echo "Generated META_WA_WEBHOOK_VERIFY_TOKEN=$META_WA_WEBHOOK_VERIFY_TOKEN"
  echo "Сохраните его — он же Verify Token в Meta Webhooks."
fi

ARGS=(
  "META_APP_ID=$META_APP_ID"
  "META_APP_SECRET=$META_APP_SECRET"
  "META_APP_WEBHOOK_SECRET=$META_APP_SECRET"
  "META_WA_WEBHOOK_VERIFY_TOKEN=$META_WA_WEBHOOK_VERIFY_TOKEN"
)

if [[ -n "$WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID" ]]; then
  ARGS+=("WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=$WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID")
fi

cd "$(dirname "$0")/.."
npx supabase@latest secrets set --project-ref "$PROJECT_REF" "${ARGS[@]}"
echo "Secrets updated for $PROJECT_REF"
