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

Production deploy (Beget VPS, `217.12.37.32`) — канонический путь:

```bash
# Через Git Bash (не WSL): maintenance-страница → wipe → env → worker → health-gate
bash scripts/deploy-prod.sh
```

Альтернативы: `proxmox-setup\direct_deploy.ps1` (side-tree deploy с traffic-gate и rollback) из Windows.
`hosting\migrate-to-beget.ps1` — одноразовая миграция со старой VM, не для обычных деплоев.

DNS: Beget panel or `hosting/setup-dns-beget.sh` (A → server IP).  
SSL: Caddy on the VPS (auto Let's Encrypt).

Legacy Proxmox path (`ubuntu@192.168.1.152`) — deprecated after migration.

GitHub Actions: `.github/workflows/preflight.yml` — проверки на push (migrate, typecheck, guards, invariants, build).  
Optional Vercel deploy: `.github/workflows/deploy.yml` (needs `VERCEL_*` secrets).

Production migrations **не** запускаются автоматически из CI/CD. Fresh DB — `src/lib/schema.sql` (Docker init). Существующую БД обновляйте вручную:

```bash
npm run migrate
# или: node scripts/migrate.mjs --status
```

Staging (guest triplet resume P0): see [`docs/staging-guest-triplet-resume.md`](docs/staging-guest-triplet-resume.md). Do not use production Beget deploy for staging migrate.
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
