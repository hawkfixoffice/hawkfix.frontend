#!/bin/sh
# Выполняет SQL в проекте через Management API. Токен берётся из окружения:
#   SUPABASE_PAT=... sh supabase/q.sh "select 1"
# Токен намеренно не хранится в файлах репозитория.
: "${SUPABASE_PAT:?нужен SUPABASE_PAT}"
REF="${SUPABASE_REF:-vpijumbbmwjibvlohfug}"
python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$1" > /tmp/.sbq.json
curl -sS -X POST -H "Authorization: Bearer $SUPABASE_PAT" -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/$REF/database/query" -d @/tmp/.sbq.json
rm -f /tmp/.sbq.json
