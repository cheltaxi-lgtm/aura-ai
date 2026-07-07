#!/usr/bin/env bash
set -euo pipefail
echo "=== platform status ==="
curl -s http://127.0.0.1:3000/api/platform/status
echo
echo "=== maintenance in DB ==="
docker exec auraai-postgres psql -U auraai -d auraai -tAc "SELECT value FROM platform_settings WHERE key='maintenanceMode'"
echo "=== spread registry ==="
cd /opt/aura-ai && npx tsx scripts/verify-spread-registry.ts 2>&1 | tail -5
echo "=== OpenRouter spread-like chat ==="
KEY=$(grep ^OPENROUTER_API_KEY= /opt/aura-ai/.env.local | cut -d= -f2- | tr -d "'\"")
node --input-type=module <<'NODE'
import { openRouterFetch } from './src/lib/openrouter-fetch.ts';
const key = process.env.KEY;
const res = await openRouterFetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://zovus.ru',
    'X-Title': 'Zovus',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Ты таролог. Ответь кратко на русском, 2-3 предложения.' },
      { role: 'user', content: 'Расклад: прошлое — Маг, настоящее — Луна, будущее — Солнце. Что это значит?' },
    ],
    max_tokens: 120,
  }),
});
console.log('http', res.status);
const text = await res.text();
console.log(text.slice(0, 350));
NODE
