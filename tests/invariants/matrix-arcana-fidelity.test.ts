import { describe, expect, it } from "vitest";
import { MAJOR_ARCANA } from "@/lib/tarot";
import { ARCANA_DICTIONARY, getArcanaEntry } from "@/lib/numerology/arcana-dictionary";
import { arcanaForNumber, destinyMatrix } from "@/lib/numerology/destiny-matrix";
import {
  canonicalizeArcanaNamesInText,
  majorArcanaNameTable,
  matrixReadingMatchesEngine,
} from "@/lib/numerology/matrix-completeness";
import { headingLineForZone } from "@/lib/numerology/matrix-reading-document";
import { listMatrixZones } from "@/lib/numerology/matrix-zones";

function skeletonReading(matrix: ReturnType<typeof destinyMatrix>): string {
  const zones = listMatrixZones(matrix);
  const blocks = zones.map((z) => {
    const title = headingLineForZone(z);
    return `${title}\nКраткий разбор зоны. Практика: один шаг.`;
  });
  return `${blocks.join("\n\n")}\n\nПростыми словами: итог.`;
}

describe("matrix arcana name table (Rider–Waite)", () => {
  it("exposes all 22 majors with RW order (8 Сила, 11 Справедливость)", () => {
    const table = majorArcanaNameTable();
    expect(table).toHaveLength(22);
    expect(getArcanaEntry(8)?.title).toBe("Сила");
    expect(getArcanaEntry(11)?.title).toBe("Справедливость");
    expect(getArcanaEntry(22)?.title).toBe("Шут");
    for (const { number, name } of table) {
      const deck = number === 22 ? MAJOR_ARCANA[0] : MAJOR_ARCANA[number];
      expect(deck?.name).toBe(name);
    }
    expect(ARCANA_DICTIONARY).toHaveLength(22);
  });

  it("arcanaForNumber uses dictionary titles", () => {
    expect(arcanaForNumber(8).arcanaName).toBe("Сила");
    expect(arcanaForNumber(11).arcanaName).toBe("Справедливость");
    expect(arcanaForNumber(22).arcanaName).toBe("Шут");
  });

  it("canonicalize rewrites Marseille / synonym swaps to engine names", () => {
    const raw =
      "Деньги (8 — Справедливость)\nОтношения (11 — Сила)\nТаланты (10 — Колесо Судьбы)";
    const fixed = canonicalizeArcanaNamesInText(raw);
    expect(fixed).toContain("8 — Сила");
    expect(fixed).toContain("11 — Справедливость");
    expect(fixed).toContain("10 — Колесо Фортуны");
    expect(fixed).not.toContain("8 — Справедливость");
  });

  it("validator rejects wrong names; accepts after canonicalize", () => {
    const matrix = destinyMatrix("1990-05-15");
    const good = skeletonReading(matrix);
    expect(matrixReadingMatchesEngine(good, matrix)).toBe(true);

    const wrongName = matrix.money.arcanaName === "Сила" ? "Справедливость" : "Правосудие";
    const bad = good.replace(
      `${matrix.money.number} — ${matrix.money.arcanaName}`,
      `${matrix.money.number} — ${wrongName}`
    );
    expect(bad).not.toBe(good);
    expect(matrixReadingMatchesEngine(bad, matrix)).toBe(false);
    expect(
      matrixReadingMatchesEngine(canonicalizeArcanaNamesInText(bad), matrix)
    ).toBe(true);
  });
});
