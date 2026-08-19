# Matrix calculation versions

| version | methodology_id | reducer | purpose | talents | paternal / lineage | arcana 8/11 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| matrix-v1 | `zovus-matrix-legacy` | digit-sum | неполная схема | неполная | неполная | Rider–Waite | snapshot only |
| matrix-v2 | `zovus-matrix-legacy` | digit-sum | смешанные точки | смешанные | смешанные | Rider–Waite | snapshot only |
| matrix-v3 | `zovus-matrix-subtract22-v3` | subtract-22 | alias comfort | AB | A+C (`maleLine.head`) | 8 Сила / 11 Справедливость | frozen replay |
| matrix-v4 | `zovus-matrix-22-v1` | digit-sum, 22 stays | alias comfort | AB | C+G, square sides | 8 Справедливость / 11 Сила | **frozen**. Do not mutate formulas. |
| matrix-v5 | `zovus-matrix-22-v2` | digit-sum, 22 stays | personal/social/spiritual | B → B+X → B+(B+X) | diagonals AB→CG / BC→GA | 8 Справедливость / 11 Сила | **live** |

Renderer versions are independent:

| renderer | used by |
| --- | --- |
| `matrix-svg-v5` | frozen v3 / v4 presentation |
| `matrix-svg-v6` | live v5 topology (same visual style, corrected lineage/purpose slots) |

Period-scoped tools store `matrix-v5@YYYY`.

`MATRIX_V5_ENGINE_FINGERPRINT` = `zovus-matrix-22-v2:digit-sum:purpose=sky+earth|male+female:talents=B,B+X,B+(B+X):lineage=FH/GI`

---

## Почему v4 не переписывается

v4 уже могла быть сохранена пользователями. Даже если v5 «правильнее»,
`destinyMatrix(..., { calculationVersion: "matrix-v4" })` обязана вернуть **старые** числа.

Routing layer: `src/lib/numerology/destiny-matrix.ts`  
Frozen engines: `destiny-matrix-v3.ts`, `destiny-matrix-v4.ts`  
Live engine: `destiny-matrix-v5.ts`

---

## Reopen (fail closed)

1. Полный structured snapshot → hydrate, без арифметики.
2. Нет snapshot:
   - `matrix-v3` → frozen v3 + stored `asOf`
   - `matrix-v4` → frozen v4 + stored `asOf`
   - `matrix-v5` → current v5 + stored `asOf`
   - `matrix-v1` / `matrix-v2` → `legacy_without_snapshot`
   - unknown (`matrix-v99`) → `unsupported_matrix_version`
3. Запрещено: stored birthDate → latest `destinyMatrix()`.

---

## Report classification

```
{
  calculationVersion,
  methodologyId,
  rendererVersion,
  replayable,
  currentMethodology,
  outdatedMethodology,
  upgradeAvailable
}
```

Старый отчёт открывается, не пересчитывается, может иметь спокойный badge
«предыдущая версия методики».

---

## Compatibility

Score 0–100 — **авторская аналитика Zovus**, не классическая метрика.
Snapshot пары хранит methodology/version обоих людей и самой совместимости.
v4 pair reopen остаётся v4.

---

## Guest

Новый guest после deploy = v5.  
Неистёкший pending v4 остаётся v4 (snapshot + stored calculationVersion).

---

## Rebuild

Новый расчёт = **новый row** с новой `calculation_version`.
Старый row остаётся. Overwrite внутри одной версии не удаляет другие версии.
