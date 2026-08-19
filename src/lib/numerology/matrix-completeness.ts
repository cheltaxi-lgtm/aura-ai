/**
 * Full destiny-matrix reading must cover the canonical zone set.
 * Titles come from matrix-zones.ts (single source of truth).
 *
 * Note: JS `\b` is ASCII-only — use `(?!\p{L})` for Cyrillic titles.
 */
import { getMatrixArcanaEntry } from "./matrix-arcana-map";
import { MATRIX_CALCULATION_VERSION } from "./matrix-result";
import type { MatrixReadingDocument } from "./matrix-reading-document";
import { matrixZoneDefsFor } from "./matrix-zones";
import type { DestinyMatrixResult } from "./destiny-matrix";

/** Rider–Waite majors 1–22 (22 = Шут). Engine / prompt / validator SSOT for names. */
export function majorArcanaNameTable(): ReadonlyArray<{ number: number; name: string }> {
  const out: Array<{ number: number; name: string }> = [];
  for (let n = 1; n <= 22; n++) {
    const title = getMatrixArcanaEntry(n, MATRIX_CALCULATION_VERSION)?.title;
    if (title) out.push({ number: n, name: title });
  }
  return out;
}

const ARCANA_PAIR_RE =
  /\b(\d{1,2})\s*([—–-])\s*([«"']?)([А-ЯЁA-Z][^\n,()»"']{1,40}?)(?=[,)\n»"']|$)/giu;

function normArcanaName(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/**
 * Rewrite every «N — Name» pair so Name matches ARCANA_DICTIONARY.
 * Model may invent Marseille swaps / synonyms; saved text must use engine titles.
 */
export function canonicalizeArcanaNamesInText(
  text: string,
  calculationVersion: string = MATRIX_CALCULATION_VERSION
): string {
  return String(text || "").replace(
    ARCANA_PAIR_RE,
    (_full, numStr: string, dash: string, openQuote: string, name: string) => {
      const n = Number(numStr);
      const canon = getMatrixArcanaEntry(n, calculationVersion)?.title;
      if (!canon || n < 1 || n > 22) {
        return `${numStr} ${dash} ${openQuote}${name}`;
      }
      const close =
        openQuote === "«" ? "»" : openQuote === '"' ? '"' : openQuote === "'" ? "'" : "";
      return `${numStr} ${dash} ${openQuote}${canon}${close}`;
    }
  );
}

/** Structured document titles/prose must use dictionary names for every zone number. */
export function matrixDocumentMatchesEngine(
  doc: MatrixReadingDocument,
  matrix: DestinyMatrixResult
): boolean {
  const expected = new Map<number, string>();
  const add = (p: { number: number; arcanaName: string } | null | undefined) => {
    if (p && !expected.has(p.number)) expected.set(p.number, p.arcanaName);
  };
  add(matrix.body);
  add(matrix.energy);
  add(matrix.roots);
  add(matrix.comfort);
  add(matrix.talents);
  add(matrix.money);
  add(matrix.relationships);
  add(matrix.paternal);
  add(matrix.maternal);
  add(matrix.purpose);
  add(matrix.skySpirit);
  add(matrix.yearArcana);
  add(matrix.monthArcana);
  add(matrix.ageCurrent);
  add(matrix.ageNext);
  if (matrix.purposeBlock) {
    add(matrix.purposeBlock.personal);
    add(matrix.purposeBlock.social);
    add(matrix.purposeBlock.spiritual);
  }
  matrix.karmicTail.forEach(add);
  matrix.agePoints.forEach(add);
  for (const ch of matrix.channels) ch.points.forEach(add);

  for (const zone of doc.zones) {
    if (zone.number == null || !zone.arcanaName) continue;
    const table = getMatrixArcanaEntry(zone.number, matrix.calculationVersion)?.title;
    if (!table) return false;
    if (normArcanaName(zone.arcanaName) !== normArcanaName(table)) return false;
    const engine = expected.get(zone.number);
    if (engine && normArcanaName(zone.arcanaName) !== normArcanaName(engine)) {
      return false;
    }
    // Title line must carry the zone's own number (engine-locked at parse time).
    if (!new RegExp(`\\b${zone.number}\\b`).test(zone.title)) return false;
  }
  return true;
}

/** Canonicalize N—Name pairs inside structured zone prose/titles. */
export function canonicalizeMatrixReadingDocument(
  doc: MatrixReadingDocument,
  calculationVersion: string = MATRIX_CALCULATION_VERSION
): MatrixReadingDocument {
  return {
    ...doc,
    intro: canonicalizeArcanaNamesInText(doc.intro || "", calculationVersion),
    finale: canonicalizeArcanaNamesInText(doc.finale || "", calculationVersion),
    zones: doc.zones.map((z) => ({
      ...z,
      title: canonicalizeArcanaNamesInText(z.title || "", calculationVersion),
      prose: canonicalizeArcanaNamesInText(z.prose || "", calculationVersion),
      practice: z.practice ? canonicalizeArcanaNamesInText(z.practice, calculationVersion) : z.practice,
      arcanaName:
        z.number != null
          ? getMatrixArcanaEntry(z.number, calculationVersion)?.title ?? z.arcanaName
          : z.arcanaName,
    })),
  };
}

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
export function matrixRequiredSections(toolId?: string, calculationVersion?: string): MatrixSectionCheck[] {
  return matrixZoneDefsFor(toolId, calculationVersion).filter((z) => z.required).map((z) => ({
  id: z.id,
  label: z.label,
  re: titleRe(z.titleCore),
  }));
}

export const MATRIX_REQUIRED_SECTIONS = matrixRequiredSections();

function hasKarmicTailCoverage(text: string, sections: MatrixSectionCheck[]): boolean {
  const root = sections.find((s) => s.id === "tail_root");
  const mid = sections.find((s) => s.id === "tail_mid");
  const tip = sections.find((s) => s.id === "tail_tip");
  if (!root && !mid && !tip) return true;
  if (root?.re.test(text) && mid?.re.test(text) && tip?.re.test(text)) return true;
  if (!titleRe(String.raw`Кармический\s+хвост`).test(text)) return false;
  const parts = (
    text.match(
      /(?:^|\n)\s*(?:·\s*)?(?:Корень|Середина|Остри[её])\s*[:.\-—–]/giu
    ) || []
  ).length;
  return parts >= 3;
}

export function matrixMissingSections(text: string, toolId?: string, calculationVersion?: string): string[] {
  const sections = matrixRequiredSections(toolId, calculationVersion);
  const raw = (text || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return sections.filter((s) => !s.id.startsWith("tail_"))
      .map((s) => s.label)
      .concat(["Кармический хвост · корень/середина/остриё"]);
  }

  const missing: string[] = [];
  for (const section of sections) {
    if (section.id.startsWith("tail_")) continue;
    if (!section.re.test(raw)) missing.push(section.label);
  }
  if (!hasKarmicTailCoverage(raw, sections)) {
    missing.push("Кармический хвост · корень/середина/остриё");
  }
  // Finale may be `## Простыми словами` (structured) or `Простыми словами:`.
  if (!/Простыми\s+словами/i.test(raw)) {
    missing.push("Простыми словами");
  }
  return missing;
}

/** Paid full matrix: all required zone headers + finale (+ sane length). */
export function isCompleteMatrixReading(text: string, toolId?: string, calculationVersion?: string): boolean {
  const t = (text || "").trim();
  if (t.length < 2200) return false;
  return matrixMissingSections(t, toolId, calculationVersion).length === 0;
}

/**
 * Post-generation arcana fidelity: every «N — Название» pair in the text must match the
 * dictionary table (and this matrix's engine names), and every required zone heading must
 * carry its own number. Catches LLM renames / Marseille swaps that length checks miss.
 */
export function matrixReadingMatchesEngine(
  text: string,
  matrix: DestinyMatrixResult,
  toolId?: string
): boolean {
  const t = (text || "").replace(/\*\*/g, "");
  if (!t.trim()) return false;

  const expected = new Map<number, string>();
  const add = (p: { number: number; arcanaName: string } | null | undefined) => {
    if (p && !expected.has(p.number)) expected.set(p.number, p.arcanaName);
  };
  add(matrix.body);
  add(matrix.energy);
  add(matrix.roots);
  add(matrix.comfort);
  add(matrix.talents);
  add(matrix.money);
  add(matrix.relationships);
  add(matrix.paternal);
  add(matrix.maternal);
  add(matrix.purpose);
  add(matrix.skySpirit);
  add(matrix.yearArcana);
  add(matrix.monthArcana);
  add(matrix.ageCurrent);
  add(matrix.ageNext);
  if (matrix.purposeBlock) {
    add(matrix.purposeBlock.personal);
    add(matrix.purposeBlock.social);
    add(matrix.purposeBlock.spiritual);
  }
  matrix.karmicTail.forEach(add);
  matrix.agePoints.forEach(add);
  for (const ch of matrix.channels) {
    ch.points.forEach(add);
  }

  for (const m of t.matchAll(ARCANA_PAIR_RE)) {
    const n = Number(m[1]);
    const name = normArcanaName(m[4] ?? "");
    if (n < 1 || n > 22 || !name) continue;
    const tableName = getMatrixArcanaEntry(n, matrix.calculationVersion)?.title;
    if (!tableName) continue;
    if (!name.startsWith(normArcanaName(tableName))) return false;
    const engineName = expected.get(n);
    if (engineName && !name.startsWith(normArcanaName(engineName))) return false;
  }

  // Every required zone heading must carry the engine's number for that zone.
  const zoneNumberById: Record<string, number> = {
    character: matrix.body.number,
    sky_energy: matrix.energy.number,
    matter: matrix.roots.number,
    comfort: matrix.comfort.number,
    talents: matrix.talents.number,
    money: matrix.money.number,
    love: matrix.relationships.number,
    father: matrix.paternal.number,
    mother: matrix.maternal.number,
    age: matrix.ageCurrent.number,
    year: matrix.yearArcana.number,
    month: matrix.monthArcana.number,
    sky_spirit: matrix.skySpirit.number,
    purpose_personal: matrix.purposeBlock?.personal.number ?? -1,
    purpose_social: matrix.purposeBlock?.social.number ?? -1,
    purpose_spiritual: matrix.purposeBlock?.spiritual.number ?? -1,
  };
  for (const def of matrixZoneDefsFor(toolId, matrix.calculationVersion)) {
    if (!def.required) continue;
    const zoneNumber = zoneNumberById[def.id];
    if (zoneNumber == null || zoneNumber < 1) continue;
    const headingWithNumber = new RegExp(
      String.raw`(?:^|\n)\s*(?:#{1,3}\s*)?(?:${EMOJI}\s*)?${def.titleCore}[^\n]*\b${zoneNumber}\b`,
      "iu"
    );
    if (!headingWithNumber.test(t)) return false;
  }
  // Tail zones may ship as aggregate «Корень/Середина/Остриё: N» lines instead of
  // per-part headings — accept those when they carry the engine's tail numbers.
  const tailNums = [matrix.karmicTail[0].number, matrix.karmicTail[1].number, matrix.karmicTail[2].number];
  const tailLabels = ["Корень", "Середина", "Остри[её]"];
  const tailCovered = tailNums.every((n, i) =>
    new RegExp(String.raw`(?:^|\n)\s*(?:·\s*)?${tailLabels[i]}\s*[:.\-—–][^\n]*\b${n}\b`, "iu").test(t)
  );
  const tailRequired = matrixZoneDefsFor(toolId, matrix.calculationVersion).some((z) => z.required && z.id === "tail_root");
  if (tailRequired && !tailCovered) {
    const perPart = ["tail_root", "tail_mid", "tail_tip"].every((id, i) => {
      const def = matrixZoneDefsFor(toolId, matrix.calculationVersion).find((z) => z.id === id);
      if (!def) return false;
      return new RegExp(
        String.raw`(?:^|\n)\s*(?:#{1,3}\s*)?(?:${EMOJI}\s*)?${def.titleCore}[^\n]*\b${tailNums[i]}\b`,
        "iu"
      ).test(t);
    });
    if (!perPart) return false;
  }
  return true;
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
