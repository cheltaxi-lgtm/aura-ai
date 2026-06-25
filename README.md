# Zovus (zovus.ru)

Маркетплейс эзотерических предсказаний на Next.js 15, TypeScript и Tailwind CSS.

## Быстрый старт

### 1. Proxmox (опционально)

```bash
# На хосте Proxmox
bash proxmox-setup/create_vm.sh

# Внутри Ubuntu VM после установки ОС
sudo bash proxmox-setup/init_ubuntu.sh
```

### 2. Локальная разработка

```bash
# База данных
docker compose up -d

# Приложение
pnpm install
pnpm dev
```

Откройте [http://localhost:3000](http://localhost:3000)

### Сервисы

| Сервис     | URL                          | Логин                    |
|------------|------------------------------|--------------------------|
| Next.js    | http://localhost:3000        | —                        |
| PostgreSQL | localhost:5432               | auraai / auraai_secret   |
| pgAdmin    | http://localhost:5050        | admin@auraai.dev / admin |

Свежая БД создаётся из `src/lib/schema.sql` (монтируется в Docker как `init.sql`). На уже существующей базе: `npm run migrate` (версионированный раннер в `scripts/migrate.mjs`).

### Переменные окружения

Скопируйте `.env.local` и укажите ключи:

- `OPENROUTER_API_KEY` — основной провайдер ответов мастеров
- `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` — резервные провайдеры
- `YUKASSA_SHOP_ID` — для оплаты

Без API-ключей приложение работает с локальными fallback-ответами персонажей.

## CI и деплой

Локальные проверки перед деплоем:

```bash
npm run verify:guardrails
npm run build
npm run predeploy:check
```

GitHub Actions: `.github/workflows/ci.yml` (push / pull_request) — `npm ci`, guardrails, build.

Production deploy: `.github/workflows/deploy.yml` (push в `main` или `workflow_dispatch`) — guardrails, build, Vercel.

Secrets в GitHub (Settings → Secrets → Actions):

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Production migrations **не** запускаются автоматически из CI/CD. Fresh DB — `src/lib/schema.sql` (Docker init). Существующую БД обновляйте вручную:

```bash
npm run migrate
# или: node scripts/migrate.mjs --status
```

## Админка

`/admin/login` — панель управления порталом (пользователи, платежи, промпты, тарифы).

## Структура

```
src/
  app/           — страницы и API routes
  components/    — UI-компоненты
  lib/           — БД, сессии, платежи, персонажи
proxmox-setup/   — скрипты развёртывания VM
docker-compose.yml
```
