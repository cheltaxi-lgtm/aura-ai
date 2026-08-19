# Матрица судьбы Zovus — методология v5

**methodology_id:** `zovus-matrix-22-v2`  
**calculation_version (live):** `matrix-v5`  
**renderer_version (live):** `matrix-svg-v6`

Это **не** лицензированная «официальная Матрица Ладини».
Zovus фиксирует одну распространённую, цельную и воспроизводимую topology системы 22 энергий.
Школы внутри одного engine не смешиваются.

Продуктовое имя: **Матрица судьбы Zovus · система 22 энергий**.

История v4 остаётся в `docs/matrix-methodology.md` и в frozen engine `destiny-matrix-v4.ts`.

---

## 1. Glossary (SSOT)

| термин | semantic id | значение |
| --- | --- | --- |
| Характер | `outer.left` / body / A | день рождения |
| Небо | `outer.top` / energy / B | месяц |
| Материя | `outer.right` / roots / C | сумма цифр года |
| Земля / карма | `outer.bottom` / karma / G | A+B+C |
| Зона комфорта | `center` / comfort / X | A+B+C+G — **не** предназначение |
| Таланты · суть | `talent.1` | B |
| Таланты · дар | `talent.2` / `vertical.top` | B+X |
| Таланты · глубина | `talent.3` | B+(B+X) |
| Отношения | `relationship.inner` | A+X |
| Деньги | `money.inner` | C+X |
| Мужская линия рода | `lineage.male` | диагональ AB → CG |
| Женская линия рода | `lineage.female` | диагональ BC → GA |
| Кармический хвост | `karmicTail.*` | G → G+X → G+(G+X) |
| Личное предназначение | `purpose.personal` | (B+G) + (A+C) |
| Социальное предназначение | `purpose.social` | (AB+CG) + (BC+GA) |
| Духовное предназначение | `purpose.spiritual` | personal + social |
| Период возраста | `age.current` | дискретная 5-летка, не паспортный возраст |
| Аркан года | `period.year` | A+B+digitSum(asOf.year) |
| Аркан месяца | `period.month` | year + calendar month |
| Аналитический акцент Zovus | `focusKey` | производная Zovus, не канон схемы |

---

## 2. Reducer

Тот же digit-sum, что у frozen v4. 22 не сворачивается.

```
reduce(n):
  n = |trunc(n)|
  while n > 22:
    n = sum of decimal digits of n
  if n == 0: return 22
  return n
```

Golden: 22→22, 23→5, 24→6, 31→4, 38→11, 42→6, 48→12.

---

## 3. Arcana 8 / 11

Matrix dictionary (Marseille): **8 = Справедливость**, **11 = Сила**.  
Колода Таро Zovus остаётся Rider–Waite и **не** меняется.

---

## 4. Base points

| id | формула | роль |
| --- | --- | --- |
| A | reduce(day) | характер |
| B | reduce(month) | небо |
| C | reduce(digitSum(year)) | материя |
| G | reduce(A+B+C) | земля / корень хвоста |
| X | reduce(A+B+C+G) | центр / зона комфорта |

Промежуточные: AB=A+B, BC=B+C, CG=C+G, GA=G+A.

---

## 5. Inner rays

| id | формула |
| --- | --- |
| love | A+X |
| loveDeep | A+(A+X) |
| talents / sky | B+X |
| talentDeep | B+(B+X) |
| money | C+X |
| moneyDeep | C+(C+X) |
| earth / tail mid | G+X |
| tail tip | G+(G+X) |

---

## 6. Purpose (не центр)

| id | формула |
| --- | --- |
| skyLine | B+G |
| earthLine | A+C |
| personal | skyLine + earthLine |
| maleChannel | AB+CG |
| femaleChannel | BC+GA |
| social | maleChannel + femaleChannel |
| spiritual | personal + social |

`purpose` в MatrixResult v5 = **личное предназначение**.  
Центр остаётся `comfort`. Alias `purpose = comfort` запрещён.

---

## 7. Lineage

Мужская диагональ F→H: AB → maleChannel → CG.  
Женская диагональ G→I: BC → femaleChannel → GA.  
Renderer рисует только эти IDs, не верхнюю/нижнюю сторону квадрата «для красоты».

---

## 8. Age / period

```
age: {
  chronological,   // паспортный возраст на asOf
  periodStart,     // 0,5,10… дискретная граница
  periodEnd,
  energy,
  nextPeriod
}
```

Нельзя писать «возраст сейчас: 35», если человеку 37.  
`birthCore` не зависит от today. `period` зависит только от явного `asOf`.

Год: `reduce(A + B + digitSum(asOf.year))`.  
Месяц: `reduce(year + calendarMonth)`.

`opportunityMonths` / `cautionMonths` и `focusKey` — авторская аналитика Zovus.

---

## 9. Sources

Выбрана одна цельная учебная topology (не смесь школ):

- yookarma.ru/docs/destiny-matrix-calculation — purpose 31.10.1984 = 9/9/18; talents 12.06.1995 = 6–9–15
- destinynums.com/linii-v-matricze-sudby/ — линии неба/земли и рода
- matrisa-sudbi.ru / matrica-sudbyy.ru — базовые A/B/C/G/X

Расхождения с v4 (поэтому v4 заморожена, а не «починена»):

- v4 talents = AB; v5 talents = B+X chain
- v4 purpose = comfort; v5 purpose — отдельный блок
- v4 lineage visually along square sides; v5 — родовые диагонали

---

## 10. Golden examples

asOf = 2026-08-18.

| дата | A B C G X | talents | personal/social/spiritual |
| --- | --- | --- | --- |
| 1990-08-15 | 15 8 19 6 12 | 20 | 21 / 15 / 9 |
| 1984-10-31 | 4 10 22 9 9 | 19 | 9 / 9 / 18 |
| 1995-06-12 | 12 6 6 6 3 | 9 (цепь 6–9–15) | 3 / 6 / 9 |
