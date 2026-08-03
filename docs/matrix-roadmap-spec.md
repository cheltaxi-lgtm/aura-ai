# ТЗ: развитие «Матрицы судьбы» — сайт + Telegram-бот

> Rollback point: `backup/pre-matrix-roadmap-2026-08-03` @ `dd3d4e3`.
> Дата: 2026-08-03. Основано на аудите кода и сравнении с 22energy / tvoyamatritsa / appmatrix / Шмидт / Acronum / Нумия.

## 0. Цели и объём

| Эпик | Что даёт | Приоритет |
|------|----------|-----------|
| **E0** Гигиена | FAQ + цены новых SKU | P0 |
| **E1** Субъект расчёта | Матрица на любого человека | P0 |
| **E2** Детская матрица | Отдельный SKU | P1 |
| **E3** PDF / печать | Print-страница по паттерну natal | P1 |
| **E4** Парная матрица 2.0 | 7 тем + бот | P2 |
| **E5** Прогноз на 12 месяцев | Ретеншн | P2 |

Принципы: цифры считает движок; fail-closed на качество; биллинг идемпотентен; сайт и бот дают одинаковый результат.

## As-is (ключевые якоря)

- Ownership: `(user_id, tool_id, birth_date, calculation_version)` в `numerology_report_history`
- Платный разбор берёт дату **только из профиля** (`src/app/api/reading/route.ts` ~318–334)
- FAQ обещает матрицу на другого (`src/app/numerology/[slug]/page.tsx` FAQ)
- Бот: sync `POST /api/internal/bot/numerology`, Grammy, callbacks `mx:*`
- Print precedent: `/cabinet/astrology/reports/[id]/print` + `window.print()`
- Цена: `PRICING.NUMEROLOGY_SESSION = 20` ᚢ ≈ 40 ₽

## E0. Гигиена

- FAQ: после E1 оставить «Да»; до релиза E1 — не врать.
- Новые цены в `pricing.ts` / `rune-costs.ts`:
  - `MATRIX_SUBJECT_REPORT: 20`
  - `CHILD_MATRIX_REPORT: 25`
  - `MATRIX_PAIR_REPORT: 30`
  - `MATRIX_YEAR_FORECAST: 20`

## E1. Субъект расчёта

### DB `093_migrate_matrix_subjects.sql`

```sql
CREATE TABLE matrix_subjects (
  id UUID PK, user_id UUID FK users,
  kind TEXT CHECK IN ('self','child','partner','other'),
  display_name TEXT, birth_date DATE NOT NULL,
  birth_time TIME, birth_city TEXT, birth_lat/lon,
  created_at, updated_at
);
UNIQUE (user_id) WHERE kind='self';
ALTER numerology_report_history ADD subject_id UUID FK;
-- backfill self + orphan other; SET NOT NULL;
DROP old unique; CREATE UNIQUE (user_id, tool_id, subject_id, calculation_version);
```

Лимит: 10 субъектов / user. Валидация даты субъекта: 0–120 лет (профиль владельца остаётся 18+).

### API / сервисы

- `list/upsert/get/delete/ensureSelf` в `numerology-report-service.ts`
- `GET/POST/DELETE /api/numerology/matrix-subjects`
- `/api/reading`: поле `matrixSubjectId`, убрать blind profile override для матрицы
- Dedupe key async job включает `matrixSubjectId`
- `useMatrixOwnership({ subjectId })`, `useMatrixSubjects()`, `MatrixSubjectPicker`
- Preview CTA: чужая дата → создать `other` subject

### Бот

- Actions: `subjects.list|create|delete`, `run` + `subjectId`
- Callbacks: `mx:subj`, `mx:subj:new`, `mx:subj:k:<kind>`, `mx:subj:s:<id>`
- Flow `matrix_subject` (reuse DOB parser, age 0–120)
- Wire orphan `mx:list` button

## E2. Детская матрица

- Tool `child_matrix`, cost 25 ᚢ
- `matrixZoneDefsFor(toolId)` — убрать money/love/matter; добавить child_purpose, parent_role, child_learning, child_support
- SEO `/numerology/detskaya-matritsa`
- Bot: `mx:child`

## E3. PDF / печать

- `/cabinet/numerology/matrix/[id]/print` по паттерну `PrintableReport`
- Кнопка «Печать / PDF» в кабинете и чате
- Бот: deep-link на print-страницу (MVP)

## E4. Парная матрица 2.0

- 7 тем + производные точки пары в движке
- `subject kind=partner`, cost 30 ᚢ
- Bot flow `mx:pair` + парная диаграмма
- SEO `/numerology/matrica-sovmestimosti`

## E5. Прогноз 12 месяцев

- Tool `matrix_year_forecast`, цифры из движка
- 12 месячных блоков + окна возможностей
- Reminder tick: 1-е число месяца блок текущего месяца

## Критерии приёмки (сквозные)

1. Два субъекта с одной датой живут независимо
2. Чужой `matrixSubjectId` → 403
3. Двойной клик → одна джоба, одно списание
4. Падение генерации → refund
5. Сайт/бот паритет цифр (verify-matrix-calc-drift)
6. FAQ соответствует коду

## Порядок выпуска

1. E1 + миграция (отдельный PR-ready коммит)
2. E0 FAQ sync
3. E3 → E2 → E4 → E5
