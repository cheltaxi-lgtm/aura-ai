import { describe, expect, it } from "vitest";
import { MAJOR_ARCANA } from "@/lib/tarot";
import { ARCANA_DICTIONARY, getArcanaEntry } from "@/lib/numerology/arcana-dictionary";
import { arcanaForNumber, destinyMatrix } from "@/lib/numerology/destiny-matrix";
import {
  canonicalizeArcanaNamesInText,
  canonicalizeMatrixReadingDocument,
  majorArcanaNameTable,
  matrixDocumentMatchesEngine,
  matrixReadingMatchesEngine,
  matrixProseMatchesRoles,
} from "@/lib/numerology/matrix-completeness";
import {
  headingLineForZone,
  MATRIX_READING_SCHEMA_VERSION,
  parseZoneBlock,
  renderMatrixReadingMarkdown,
} from "@/lib/numerology/matrix-reading-document";
import { listMatrixZones } from "@/lib/numerology/matrix-zones";

function skeletonReading(matrix: ReturnType<typeof destinyMatrix>): string {
  const zones = listMatrixZones(matrix);
  const blocks = zones.map((z) => {
    const title = headingLineForZone(z);
    return `${title}\nКраткий разбор зоны. Практика: один шаг.`;
  });
  return `${blocks.join("\n\n")}\n\nПростыми словами: итог.`;
}

describe("matrix arcana name table (Marseille for Matrix, RW for Tarot)", () => {
  it("recognizes declined titles without consuming the rest of a sentence or ordinal numbers", () => {
    const matrix = destinyMatrix("1988-03-03")!;
    const raw = "После 18 — Луны стоит 8 — Справедливость, поэтому проверь условия. Переход к 8 — Справедливости потребует ясных решений. 10-й аркан задаёт другой ритм.";
    const fixed = canonicalizeArcanaNamesInText(raw);
    expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\n${raw}`, matrix)).toBe(true);
    expect(fixed).toBe(raw);
    expect(canonicalizeArcanaNamesInText(fixed)).toBe(fixed);
    expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\n${fixed}`, matrix)).toBe(true);
    expect(canonicalizeArcanaNamesInText("11 — Справедливостью поддержи границы.")).toBe("11 — Сила поддержи границы.");
    expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\nДни с 5 по 7 — проверь условия и сохрани договорённости.`, matrix)).toBe(true);
    expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\nАркан (7 — «Безымянный»).`, matrix)).toBe(false);
    expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\nАркан 7 — Безымянный.`, matrix)).toBe(false);
    expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\nАркан (20 — «Судьба»).`, matrix)).toBe(false);
  });
  it("rejects a wrong money-zone number inside an explicitly labelled comparison", () => {
    const matrix = destinyMatrix("1988-03-03")!;
    expect(matrix.money.number).toBe(18);
    expect(matrixProseMatchesRoles("В отличие от зоны денег, где 10-й аркан связан с обменом, здесь он помогает поддерживать ритм.", matrix)).toBe(false);
    expect(matrixProseMatchesRoles("В отличие от зоны денег, где 18-й аркан связан с обменом, здесь он помогает поддерживать ритм.", matrix)).toBe(true);
    expect(matrixProseMatchesRoles("В зоне денег важно проверить условия за 10 дней.", matrix)).toBe(true);
    expect(matrixProseMatchesRoles("В зоне денег, где 10% дохода идёт в резерв, проверь свой бюджет.", matrix)).toBe(true);
    expect(matrixProseMatchesRoles("В денежной зоне 10 минут в неделю посвяти сверке бюджета.", matrix)).toBe(true);
    expect(matrixProseMatchesRoles("В зоне денег — 10 дней наблюдения.", matrix)).toBe(true);
    expect(matrixProseMatchesRoles("В отличие от зоны денег, где стоит 10-й аркан.", matrix)).toBe(false);
    expect(matrixProseMatchesRoles("Денежная зона — 10. Следи за расходами.", matrix)).toBe(false);
    expect(matrixProseMatchesRoles("В зоне денег, где стоит 10. Следи за расходами.", matrix)).toBe(false);
    expect(matrixProseMatchesRoles("В зоне денег, где стоит 18. Следи за расходами.", matrix)).toBe(true);
    expect(matrixProseMatchesRoles("В зоне денег — 10.5 процента дохода идёт в резерв.", matrix)).toBe(true);
    expect(matrix.comfort.number).toBe(10);
    expect(matrixProseMatchesRoles("Для зоны комфорта, где стоит 22-й аркан, важен отдых.", matrix)).toBe(false);
    expect(matrixProseMatchesRoles("Для зоны комфорта, где стоит 10-й аркан, важен отдых.", matrix)).toBe(true);
  });
  it("distinguishes ordinal arcana assertions from day and step instructions", () => {
    const matrix = destinyMatrix("1988-03-03")!;
    for (const raw of ["Аркан 8-й — Сила.", "8-й аркан — Сила.", "Энергия 8 — сила связана с волей и выдержкой."]) {
      expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\n${raw}`, matrix)).toBe(false);
      const fixed = canonicalizeArcanaNamesInText(raw);
      expect(fixed).toContain("Справедливость");
      expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\n${fixed}`, matrix)).toBe(true);
    }
    const longUnknown = "Аркан 8 — Безымянный архетип помогает вам сохранять спокойствие в долгих переговорах.";
    expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\n${longUnknown}`, matrix)).toBe(false);
    for (const plan of ["День 8 — сила привычки помогает сохранить ритм.", "Шаг 20 — мир с близкими важнее спора.", "Дни 1–8 — Сила привычки помогает сохранить ритм.", "День №8 — Сила привычки помогает сохранить ритм.", "Шаг №20 — Мир с близкими важнее спора.", "День: 8 — Сила привычки."]) {
      expect(canonicalizeArcanaNamesInText(plan)).toBe(plan);
      expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\n${plan}`, matrix)).toBe(true);
    }
  });
  it("checks long prose and normalizes flexible whitespace without deleting the continuation", () => {
    const matrix = destinyMatrix("1990-05-15")!;
    const long = "8 — Сила поможет принять справедливое решение в денежном канале.";
    expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\n${long}`, matrix)).toBe(false);
    const fixed = canonicalizeArcanaNamesInText(long);
    expect(fixed).toBe("8 — Справедливость поможет принять справедливое решение в денежном канале.");
    expect(matrixReadingMatchesEngine(`${skeletonReading(matrix)}\n${fixed}`, matrix)).toBe(true);
    expect(canonicalizeArcanaNamesInText("10 — Колесо  Судьбы. 2 — Верховная   Жрица.")).toBe("10 — Колесо Фортуны. 2 — Жрица.");
  });
  it("preserves complete actions and surrounding punctuation while correcting only an arcana title", () => {
    const raw = "2) Перед оплатой проверь бюджет — ресурс 4 — Император поможет удержать границы.\n3) Так ты экологично проживёшь 12 — Повешенный.\n4) Используй 8 — «Сила», сохраняя спокойствие.";
    const fixed = canonicalizeArcanaNamesInText(raw);
    expect(fixed).toBe("2) Перед оплатой проверь бюджет — ресурс 4 — Император поможет удержать границы.\n3) Так ты экологично проживёшь 12 — Повешенный.\n4) Используй 8 — «Справедливость», сохраняя спокойствие.");
    expect(canonicalizeArcanaNamesInText(fixed)).toBe(fixed);
  });
  it("keeps Tarot deck on Rider–Waite while Matrix uses 8 Justice / 11 Strength", () => {
    const table = majorArcanaNameTable();
    expect(table).toHaveLength(22);
    expect(getArcanaEntry(8)?.title).toBe("Сила");
    expect(getArcanaEntry(11)?.title).toBe("Справедливость");
    expect(table.find((row) => row.number === 8)?.name).toBe("Справедливость");
    expect(table.find((row) => row.number === 11)?.name).toBe("Сила");
    expect(MAJOR_ARCANA.find((c) => c.id === 8)?.name).toBe("Сила");
    expect(MAJOR_ARCANA.find((c) => c.id === 11)?.name).toBe("Справедливость");
    expect(ARCANA_DICTIONARY).toHaveLength(22);
  });

  it("arcanaForNumber uses Matrix dictionary titles", () => {
    expect(arcanaForNumber(8).arcanaName).toBe("Справедливость");
    expect(arcanaForNumber(11).arcanaName).toBe("Сила");
    expect(arcanaForNumber(22).arcanaName).toBe("Шут");
  });

  it("canonicalize rewrites Rider–Waite swaps to Matrix names", () => {
    const raw =
      "Деньги (8 — Сила)\nОтношения (11 — Справедливость)\nТаланты (10 — Колесо Судьбы)";
    const fixed = canonicalizeArcanaNamesInText(raw);
    expect(fixed).toContain("8 — Справедливость");
    expect(fixed).toContain("11 — Сила");
    expect(fixed).toContain("10 — Колесо Фортуны");
    expect(fixed).not.toContain("8 — Сила");
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

  it("structured document path locks engine titles", () => {
    const matrix = destinyMatrix("1990-01-15");
    const zones = listMatrixZones(matrix);
    const doc = {
      schemaVersion: MATRIX_READING_SCHEMA_VERSION,
      intro: "Вступление.",
      zones: zones.map((z) =>
        parseZoneBlock(
          `${headingLineForZone(z)}\nТекст. Практика: шаг.`,
          z,
          "ai"
        )
      ),
      finale: "Итог.",
      meta: { aiZones: zones.length, engineZones: 0, totalZones: zones.length },
    };
    expect(matrixDocumentMatchesEngine(doc, matrix)).toBe(true);
    const locked = canonicalizeMatrixReadingDocument(doc);
    expect(matrixDocumentMatchesEngine(locked, matrix)).toBe(true);
    expect(
      matrixReadingMatchesEngine(renderMatrixReadingMarkdown(locked), matrix)
    ).toBe(true);
  });
});
