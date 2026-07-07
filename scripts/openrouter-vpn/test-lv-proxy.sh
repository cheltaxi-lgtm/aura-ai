#!/usr/bin/env bash
set -euo pipefail
curl -s -o /dev/null -w "via_lv_proxy:%{http_code}\n" --max-time 12 -x http://45.156.20.127:3128 https://openrouter.ai/api/v1/models
KEY=$(grep ^OPENROUTER_API_KEY= /opt/aura-ai/.env.local | cut -d= -f2- | tr -d "'\"")
curl -s -o /tmp/orlv.json -w "chat_via_proxy:%{http_code}\n" --max-time 20 -x http://45.156.20.127:3128 \
  -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Say OK"}],"max_tokens":5}'
head -c 120 /tmp/orlv.json
echo
