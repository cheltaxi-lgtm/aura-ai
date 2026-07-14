#!/usr/bin/env bash
set -euo pipefail
KEY=$(grep ^OPENROUTER_API_KEY= /opt/aura-ai/.env.local | cut -d= -f2- | tr -d "\"'")
HTTP=$(curl -s -o /tmp/or_test.json -w '%{http_code}' \
  https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://zovus.ru" \
  -H "X-Title: Zovus" \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"say ok"}],"max_tokens":5}')
echo "HTTP:$HTTP"
head -c 400 /tmp/or_test.json
echo
