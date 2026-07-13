# Чеклист настройки отчётности Yandex Metrika (Zovus)

**Счётчик:** `110138367`  
**Сайт:** https://zovus.ru  
**Когда выполнять:** после деплоя эпиков P0–P1 (reCAPTCHA, гостевая воронка, mobile UX, трекинг SEO/покупок).

---

## 1. Сегменты

### 1.1 «Гость»

- **Настройки → Сегменты → Создать**
- Условия:
  - URL **не содержит** `/admin`, `/cabinet`, `/expert`
  - (опционально) нет авторизационной cookie, если используете visit params

### 1.2 «Mobile guest»

- Устройство: **smartphone**
- Пересечение с сегментом **«Гость»**

### 1.3 «Исключить QA»

- IP команды **или** URL содержит `app=1` (для app-shell — отдельный отчёт)
- Использовать как **исключающий** фильтр в основных отчётах

---

## 2. Составная воронка

**Отчёты → Стандартные отчёты → Конверсии → Составная цель** (или воронка по целям):

| Шаг | Goal id |
|-----|---------|
| 1 | `landing_view` |
| 2 | `guest_spread_started` |
| 3 | `guest_spread_completed` |
| 4 | `registration_account_created` |
| 5 | `registration_completed` |
| 6 | `first_chat_opened` |

Фильтр: сегмент **«Mobile guest»** и **без QA**.

---

## 3. Дашборд KPI (6 виджетов)

**Дашборд:** [Zovus — конверсия](https://metrika.yandex.ru/dashboard?id=110138367&dashboardId=5f0f7e1d-03c6-42eb-a8de-7887c9431681)  
**dashboardId:** `5f0f7e1d-03c6-42eb-a8de-7887c9431681`  
**Период:** неделя (7–13 июля)

| # | Виджет | Статус |
|---|--------|--------|
| 1 | **Визиты /** — показатель «Визиты» | ✅ создан |
| 2 | **Bounce** — `/auth/user/register` или «Доля отказов» | ⏳ добавить вручную |
| 3 | **guest_spread_started** — цель «Гостевой расклад — начало», метрика «Достижения цели» | ⏳ |
| 4 | **registration_account_created** — «Регистрация — аккаунт создан» | ⏳ |
| 5 | **first_chat_opened** — «Первый чат» | ⏳ |
| 6 | **rune_purchase** — «Покупка рун (доход)», метрика «Доход» | ⏳ |

**Как добавить виджет:** Дашборд → **Добавить** → **+ Новый виджет** → тип **Показатель** → **+** у поля «Цель» → поиск по slug или русскому имени → имя → **Создать**.

---

## 4. Вебмастер ↔ Метрика

- Яндекс.Вебмастер → **Настройки** → привязать счётчик **110138367**
- После деплоя: `node scripts/post-deploy-seo.mjs https://zovus.ru`

---

## 5. E-commerce

- Убедиться, что цель `rune_purchase` помечена как **денежная**
- Проверить отчёт **Электронная коммерция** после тестовой покупки
- dataLayer `purchase` инициализируется в `YandexMetrika.tsx`

---

## 6. Webvisor review (15 записей)

После деплоя P0, за неделю:

- Фильтр: mobile, гость, вход с `/`
- Чеклист на запись:
  - [ ] Hero CTA виден, не перекрыт tab bar
  - [ ] Гостевой spread: pick → flip → preview
  - [ ] CTA «Получить полную расшифровку» → регистрация
  - [ ] reCAPTCHA не блокирует без причины
  - [ ] Reload `/?app=1&step=chat` без долгого overlay

---

## 7. Новые SEO-цели (после sync)

Запуск синхронизации:

```bash
node scripts/sync-metrika-goals.mjs
```

Новые goal id для проверки в браузере (`ym(110138367,'reachGoal',...)`):

- `rasklady_hub_view`, `lenormand_hub_view`, `taro_hub_view`, `cards_hub_view`
- `photo_landing_view`, `ritual_catalog_view`
- `numerology_hub_view`, `numerology_topic_view`, `lenormand_combo_view`
- `share_channel` (params: `channel`, `kind`)

---

## 8. A/B hero (через 14 дней)

Сравнить `guest_spread_started / landing_view` по параметру **`hero_variant`** (`a`, `b`, `c`) в отчёте по цели `landing_view`.
