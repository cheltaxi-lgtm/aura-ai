# Matrix calculation versions

| version | methodology_id | reducer | paternal | arcana 8/11 | status |
| --- | --- | --- | --- | --- | --- |
| matrix-v1 | `zovus-matrix-legacy` | digit-sum | неполная схема | Rider–Waite | immutable replay via snapshot only |
| matrix-v2 | `zovus-matrix-legacy` | digit-sum | смешанные точки | Rider–Waite | immutable replay via snapshot only |
| matrix-v3 | `zovus-matrix-subtract22-v3` | subtract-22 | A+C (`maleLine.head`) | Rider–Waite 8 Сила / 11 Справедливость | frozen engine for replay |
| matrix-v4 | `zovus-matrix-22-v1` | digit-sum, 22 stays | C+G (вершина прямого квадрата) | 8 Справедливость / 11 Сила | **live** |

Period-scoped tools store `matrix-v4@YYYY`.

## Почему matrix-v3 не переписывается

v3 сознательно ушёл на вычитание 22, чтобы «достать» высокие арканы.
Это не учебная 22-энергетическая редукция. Старые купленные отчёты должны
открываться со **старыми** числами.

## Что нельзя делать при смене версии

- DELETE купленного отчёта другой `calculation_version`
- вызывать `destinyMatrix(birthDate)` без версии/snapshot при reopen
- помечать v1/v2 как unusable и бесплатно затирать текст
- смешивать v3 и v4 в одном compatibility snapshot

## Reopen

1. Если есть полный `structured_snapshot` — `hydrate` без арифметики.  
2. Иначе `matrix-v3` → frozen subtract-22 engine + сохранённый `asOf`.  
3. Иначе `matrix-v4` → live engine + сохранённый `asOf`.  
4. `matrix-v1` / `matrix-v2` без snapshot → текст отчёта, схема не пересчитывается live-движком.

## Rebuild

Новый расчёт = **новый row** с новой `calculation_version`.
Старый row остаётся. Пользователь может открыть оба.
