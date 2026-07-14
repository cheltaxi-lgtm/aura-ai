#!/usr/bin/env bash
set -euo pipefail
cd /opt/aura-ai
export $(grep -E '^OPENROUTER_API_KEY=' .env.local | sed 's/\r$//')
KEY="${OPENROUTER_API_KEY:-}"
HTTP=$(curl -s -o /tmp/or_models.json -w '%{http_code}' \
  'https://openrouter.ai/api/v1/models' \
  -H "Authorization: Bearer $KEY" \
  -H 'HTTP-Referer: https://zovus.ru' \
  -H 'X-Title: Zovus')
echo "openrouter_models HTTP:$HTTP"
head -c 150 /tmp/or_models.json
echo
node <<'NODE'
const fs = require('fs');
const http = require('http');
http.get('http://127.0.0.1:3000/api/admin/models', (res) => {
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => {
    console.log('admin_models_no_auth HTTP:' + res.statusCode);
    console.log(body.slice(0, 300));
  });
}).on('error', console.error);
NODE
