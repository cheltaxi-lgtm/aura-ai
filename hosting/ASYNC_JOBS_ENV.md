# Env: aura-ai ↔ aura-ai-async-jobs

## Проблема

Два процесса:

| Процесс | systemd | Env file |
| --- | --- | --- |
| Next.js app | `aura-ai` | `/opt/aura-ai/.env.local` (root:600) |
| Async worker | `aura-ai-async-jobs` | `/opt/aura-ai/.env.async-jobs` (aura-ai:600) |

Воркер **не** читает `.env.local`. Общие переменные копируются скриптом.

## Источник истины для shared keys

Файл: [`hosting/async-jobs-shared.env.keys`](async-jobs-shared.env.keys)

При добавлении переменной, нужной **обоим** процессам (особенно OpenRouter / LLM / report queue):

1. Добавь ключ в `.env.local`
2. Добавь имя ключа в `async-jobs-shared.env.keys`
3. На сервере: `bash hosting/ensure-async-jobs-user.sh /opt/aura-ai`  
   (внутри вызывает `sync-async-jobs-env.sh`)
4. `systemctl restart aura-ai-async-jobs`

Обязательные всегда: `DATABASE_URL`, `ASYNC_JOB_WORKER_SECRET`, `ASYNC_JOB_APP_URL=http://127.0.0.1:3000`.

Также обязательно для in-process отчётов: `AUTH_SECRET` (подпись session claim / cookies внутри route handlers), `OPENROUTER_API_KEY`, `OPENROUTER_HTTPS_PROXY`.

## OpenRouter через Стокгольм

С Beget (`217.12.37.32`) прямой доступ к `openrouter.ai` таймаутится.

```bash
# в .env.local
OPENROUTER_HTTPS_PROXY=http://91.184.240.82:3128
OPENROUTER_API_KEY=...
```

Оба ключа должны быть в `async-jobs-shared.env.keys` (уже есть).  
Синк **падает с ошибкой**, если в `.env.async-jobs` есть ключ API без proxy.

### Проверка после деплоя

```bash
# 1) sync
bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai
grep -E '^(OPENROUTER_HTTPS_PROXY|OPENROUTER_API_KEY|ASYNC_REPORT_INPROCESS)=' /opt/aura-ai/.env.async-jobs

# 2) curl via proxy (с VM)
KEY=$(grep '^OPENROUTER_API_KEY=' /opt/aura-ai/.env.local | cut -d= -f2- | tr -d '\r"'"'")
curl -sS --max-time 20 -x http://91.184.240.82:3128 \
  https://openrouter.ai/api/v1/key -H "Authorization: Bearer $KEY" | head -c 200

# 3) worker log
systemctl restart aura-ai-async-jobs
tail -20 /var/log/aura-ai/async-jobs.log
# ожидать: OpenRouter OK via proxy=91.184.240.82:3128
# и: inprocess=true (если ASYNC_REPORT_INPROCESS=1)

# 4) админка
# https://zovus.ru/admin/async-jobs — блок «LLM из воркера»
```

Proxy на Sweden ставится скриптом `scripts/openrouter-vpn/install-se-proxy.sh` (tinyproxy, allow только IP Beget).

## Report queue flags

| Key | Default | Meaning |
| --- | --- | --- |
| `ASYNC_REPORT_INPROCESS` | off | `1` = LLM отчётов в воркере, не HTTP→Next |
| `ASYNC_REPORT_CONCURRENCY` | 2 | параллельных report jobs |
| `DB_POOL_MAX_WORKER` | 5 | PG pool воркера |
