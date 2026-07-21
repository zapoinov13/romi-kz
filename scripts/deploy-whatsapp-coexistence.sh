#!/usr/bin/env bash
# Deploy Meta WhatsApp Coexistence edge functions to ROMI prod.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-rgttklitvvqsnlsakvzr}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: export SUPABASE_ACCESS_TOKEN=..."
  exit 1
fi

cd "$(dirname "$0")/.."
CLI=(npx supabase@latest)

echo "Project: $PROJECT_REF"
echo "1/6 wa-cloud-webhook (no JWT)"
"${CLI[@]}" functions deploy wa-cloud-webhook --project-ref "$PROJECT_REF" --no-verify-jwt

echo "2/6 wa-embedded-config"
"${CLI[@]}" functions deploy wa-embedded-config --project-ref "$PROJECT_REF"

echo "3/6 wa-complete"
"${CLI[@]}" functions deploy wa-complete --project-ref "$PROJECT_REF"

echo "4/6 wa-status"
"${CLI[@]}" functions deploy wa-status --project-ref "$PROJECT_REF"

echo "5/6 wa-disconnect"
"${CLI[@]}" functions deploy wa-disconnect --project-ref "$PROJECT_REF"

echo "6/6 wa-send"
"${CLI[@]}" functions deploy wa-send --project-ref "$PROJECT_REF"

echo ""
echo "Done. Apply SQL: scripts/lovable-whatsapp-coexistence.sql"
echo "Secrets: see scripts/META_WHATSAPP_COEXISTENCE.md"
