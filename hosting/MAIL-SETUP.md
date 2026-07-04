# Почта Zovus (zovus.ru)

## Архитектура

| Канал | Назначение |
|-------|------------|
| **Yandex 360** | Служебные ящики `@zovus.ru` (support, admin, noreply) |
| **Resend** (приоритет) | Транзакционная рассылка из приложения |
| **SMTP Yandex** (fallback) | Если Resend недоступен — `smtp.yandex.ru:465` |

Приложение пишет журнал в таблицу `email_log`. Админка: `/admin/email`.

## Служебные ящики

| Ящик | Роль |
|------|------|
| `noreply@zovus.ru` | Регистрация, сброс пароля, напоминания, joint reading |
| `support@zovus.ru` | Поддержка пользователей (футер, оферта) |
| `privacy@zovus.ru` | 152-ФЗ (можно алиас на support) |
| `claims@zovus.ru` | Претензии и возвраты |
| `admin@zovus.ru` | Алерты о новых тикетах поддержки |

## 1. DNS на Beget

**Важно:** `changeRecords` заменяет все записи зоны — всегда задавайте A + MX + TXT одним вызовом.

```bash
# через homeserver (креды в ~/.acme.sh/account.conf)
scp hosting/fix-mail-dns-beget.py ubuntu@192.168.1.50:/tmp/
ssh ubuntu@192.168.1.50 \
  'source ~/.acme.sh/account.conf; export BEGET_LOGIN="$SAVED_Beget_Username" BEGET_PASSWORD="$SAVED_Beget_Password"; \
   python3 /tmp/fix-mail-dns-beget.py ~/.acme.sh/account.conf 217.12.37.32 7902ba7dfdb76ac3 yandex'

# или bash-скрипт (тоже задаёт A+MX+TXT разом)
export BEGET_LOGIN=... BEGET_PASSWORD=...
./hosting/setup-mail-dns-beget.sh
```

Почта Beget через API (`hosting/setup-beget-mail.py`) работает только при **тарифе с почтой** (на VPS-only аккаунте API возвращает ошибку 1208).

## 2. Yandex 360

1. [admin.yandex.ru](https://admin.yandex.ru) → подключить домен `zovus.ru`
2. MX уже указывает на `mx.yandex.net` (настроено через Beget DNS)
3. Создать пользователей/алиасы из таблицы выше
4. Для `noreply@` — **пароль приложения** → `SMTP_PASS` в `.env.local`

```bash
bash hosting/apply-mail-env.sh /opt/aura-ai/.env.local
# добавить SMTP_PASS=re_... или пароль приложения Yandex
systemctl restart aura-ai
```

## 3. Resend (рекомендуется)

1. [resend.com](https://resend.com) → Domains → Add `zovus.ru`
2. Добавить DKIM TXT (`resend._domainkey`) — скрипт или панель Beget
3. API Key → `RESEND_API_KEY` в `/opt/aura-ai/.env.local`

## 4. Переменные на сервере

```env
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=Zovus <noreply@zovus.ru>
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@zovus.ru
SMTP_PASS=xxxxxxxx
MAIL_SUPPORT=support@zovus.ru
MAIL_PRIVACY=privacy@zovus.ru
MAIL_CLAIMS=claims@zovus.ru
MAIL_ADMIN_NOTIFY=admin@zovus.ru
```

## 5. Миграция и проверка

```bash
cd /opt/aura-ai && node scripts/migrate.mjs
# Админка → Почта → «Тестовое письмо себе»
```

## Какие письма отправляет приложение

- Welcome — после регистрации
- Password reset — `/auth/user/forgot-password`
- Daily reminder — cron (если включено в профиле)
- Joint reading — партнёр завершил / оба готовы
- Support — автоответ пользователю + алерт admin при новом тикете
- Support reply — email пользователю при ответе админа

## Примечание по deliverability

Не поднимайте Postfix на том же VPS, что и сайт — IP часто в спам-листах. Yandex 360 + Resend — стандартная схема для `.ru` доменов.
