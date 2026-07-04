#!/usr/bin/env bash
# Batch-sync WhatsApp profile names via Green API getContactInfo.
# Requires SUPABASE_SERVICE_ROLE_KEY (Lovable → Settings → API → service_role secret).
set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-https://rgttklitvvqsnlsakvzr.supabase.co}}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
PROJECT_ID="${1:-}"

if [[ -z "$SERVICE_KEY" ]]; then
  echo "Set SUPABASE_SERVICE_ROLE_KEY env var" >&2
  exit 1
fi
if [[ -z "$PROJECT_ID" ]]; then
  echo "Usage: SUPABASE_SERVICE_ROLE_KEY=... $0 <project_id> [limit]" >&2
  exit 1
fi

LIMIT="${2:-100}"

curl -sS -X POST "${SUPABASE_URL}/functions/v1/greenapi-sync-name" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"batch\":true,\"project_id\":\"${PROJECT_ID}\",\"limit\":${LIMIT}}" \
  | python3 -m json.tool
