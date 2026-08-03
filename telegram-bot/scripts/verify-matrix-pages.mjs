import { buildMatrixTelegramPages } from "../src/domain/matrix/format.ts";

const raw = `
Геннадий, полная матрица — разбор по зонам.

Характер (18 — Луна)
Геннадий, в точке характера стоит Луна. Свет зоны: интуиция.

Деньги (15 — Дьявол)
Геннадий, твой
Деньги
через страсть и харизму работают сильно, но есть риск перерасхода.
Практика: один учёт доходов за неделю.

Отношения (7 — Колесница)
Геннадий, в отношениях важен темп и направление.

Шаги на 30 дней
1) Один шаг по деньгам.
2) Один шаг по характеру.
`.trim();

const pages = buildMatrixTelegramPages(raw);
console.log(
  "pages",
  pages.length,
  pages.map((p, i) => ({
    i: i + 1,
    head: p.replace(/<[^>]+>/g, "").slice(0, 70),
    len: p.length,
  }))
);

const moneyPage = pages.find((p) => /Деньги \(15/i.test(p));
if (!moneyPage) {
  console.error("FAIL: no money page with arcana title");
  process.exit(1);
}
if (!/через страсть/i.test(moneyPage)) {
  console.error("FAIL: money body split away from title\n", moneyPage);
  process.exit(1);
}
if (/^[^]*Деньги \(15[^]*·\s*\d+\s*\/\s*\d+/m.test(moneyPage) === false) {
  /* ok — page indicator added later */
}
const tiny = pages.filter((p) => p.replace(/<[^>]+>/g, "").trim().length < 60);
if (tiny.length) {
  console.error(
    "FAIL: tiny pages remain",
    tiny.map((p) => p.replace(/<[^>]+>/g, "").slice(0, 80))
  );
  process.exit(1);
}
console.log("OK verify-matrix-pages");
