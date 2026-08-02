/**
 * Full destiny-matrix reading must cover the canonical zone set.
 * Titles come from matrix-zones.ts (single source of truth).
 *
 * Note: JS `\b` is ASCII-only — use `(?!\p{L})` for Cyrillic titles.
 */
import { MATRIX_ZONE_DEFS } from "./matrix-zones";

export type MatrixSectionCheck = {
  id: string;
  label: string;
  re: RegExp;
};

const EMOJI = String.raw`[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]`;
const BOUND = String.raw`(?!\p{L})`;

function titleRe(core: string): RegExp {
  return new RegExp(
    // Allow structured markdown headings (### Отношения …) from matrix-reading-document.
    String.raw`(?:^|\n)\s*(?:#{1,3}\s*)?(?:${EMOJI}\s*)?${core}${BOUND}`,
    "iu"
  );
}

/** Required paid zones — derived from MATRIX_ZONE_DEFS. */
export const MATRIX_REQUIRED_SECTIONS: MatrixSectionCheck[] = MATRIX_ZONE_DEFS.filter(
  (z) => z.required
).map((z) => ({
  id: z.id,
  label: z.label,
  re: titleRe(z.titleCore),
}));

function hasKarmicTailCoverage(text: string): boolean {
  const root = MATRIX_REQUIRED_SECTIONS.find((s) => s.id === "tail_root");
  const mid = MATRIX_REQUIRED_SECTIONS.find((s) => s.id === "tail_mid");
  const tip = MATRIX_REQUIRED_SECTIONS.find((s) => s.id === "tail_tip");
  if (root?.re.test(text) && mid?.re.test(text) && tip?.re.test(text)) return true;
  if (!titleRe(String.raw`Кармический\s+хвост`).test(text)) return false;
  const parts = (
    text.match(
      /(?:^|\n)\s*(?:·\s*)?(?:Корень|Середина|Остри[её])\s*[:.\-—–]/giu
    ) || []
  ).length;
  return parts >= 3;
}

export function matrixMissingSections(text: string): string[] {
  const raw = (text || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return MATRIX_REQUIRED_SECTIONS.filter((s) => !s.id.startsWith("tail_"))
      .map((s) => s.label)
      .concat(["Кармический хвост · корень/середина/остриё"]);
  }

  const missing: string[] = [];
  for (const section of MATRIX_REQUIRED_SECTIONS) {
    if (section.id.startsWith("tail_")) continue;
    if (!section.re.test(raw)) missing.push(section.label);
  }
  if (!hasKarmicTailCoverage(raw)) {
    missing.push("Кармический хвост · корень/середина/остриё");
  }
  // Finale may be `## Простыми словами` (structured) or `Простыми словами:`.
  if (!/Простыми\s+словами/i.test(raw)) {
    missing.push("Простыми словами");
  }
  return missing;
}

/** Paid full matrix: all required zone headers + finale (+ sane length). */
export function isCompleteMatrixReading(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 2200) return false;
  return matrixMissingSections(t).length === 0;
}

export function matrixContinuePrompt(missing: string[]): string {
  const list = missing.slice(0, 12).join(" → ");
  return [
    "Текст неполный: не хватает обязательных зон матрицы.",
    "Продолжи с того места, где остановилась — без повтора уже написанного.",
    `Допиши ОТДЕЛЬНЫМИ блоками (заголовок на своей строке) всё недостающее: ${list}.`,
    "На каждую зону — 4–6 предложений + строка «Практика: …».",
    "В конце обязателен блок «Шаги на 30 дней» нумерованным текстом 1) 2) 3).",
    "Не пиши «Простыми словами» и не сворачивай зоны в краткое резюме.",
  ].join(" ");
}
