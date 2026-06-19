# Aura

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

### Переменные окружения

Скопируйте `.env.local` и укажите ключи:

- `OPENROUTER_API_KEY` — основной провайдер ответов мастеров
- `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` — резервные провайдеры
- `YUKASSA_SHOP_ID` — для оплаты

Без API-ключей приложение работает с локальными fallback-ответами персонажей.

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
