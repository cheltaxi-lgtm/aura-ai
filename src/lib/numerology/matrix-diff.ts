/**
 * Diff previous saved matrix structured_data vs current calculation (living cycle).
 */

export type MatrixDiffLine = {
  key: string;
  label: string;
  from?: number | string;
  to?: number | string;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && typeof (v as { number?: unknown }).number === "number") {
    return (v as { number: number }).number;
  }
  return null;
}

/** Compare previous report structured_data with a fresh matrixToStructuredData payload. */
export function diffMatrixStructured(
  previous: Record<string, unknown> | null | undefined,
  current: Record<string, unknown>
): MatrixDiffLine[] {
  if (!previous || typeof previous !== "object") return [];
  const lines: MatrixDiffLine[] = [];
  const pairs: Array<{ key: string; label: string }> = [
    { key: "comfort", label: "Зона комфорта" },
    { key: "money", label: "Деньги" },
    { key: "relationships", label: "Отношения" },
    { key: "yearArcana", label: "Аркан года" },
    { key: "monthArcana", label: "Аркан месяца" },
    { key: "focusLabel", label: "Узел периода" },
  ];
  for (const { key, label } of pairs) {
    if (key === "focusLabel") {
      const from = typeof previous.focusLabel === "string" ? previous.focusLabel : undefined;
      const to = typeof current.focusLabel === "string" ? current.focusLabel : undefined;
      if (from && to && from !== to) lines.push({ key, label, from, to });
      continue;
    }
    const from = num(previous[key]);
    const to = num(current[key]);
    if (from != null && to != null && from !== to) {
      lines.push({ key, label, from, to });
    }
  }
  const prevTail = Array.isArray(previous.karmicTail)
    ? previous.karmicTail.map(num).filter((n): n is number => n != null)
    : [];
  const curTail = Array.isArray(current.karmicTail)
    ? current.karmicTail.map(num).filter((n): n is number => n != null)
    : [];
  if (
    prevTail.length === 3 &&
    curTail.length === 3 &&
    prevTail.some((n, i) => n !== curTail[i])
  ) {
    lines.push({
      key: "karmicTail",
      label: "Кармический хвост",
      from: prevTail.join("→"),
      to: curTail.join("→"),
    });
  }
  return lines;
}

export function formatMatrixDiffTeaser(lines: MatrixDiffLine[]): string | null {
  if (!lines.length) return null;
  return [
    "С прошлого разбора изменилось:",
    ...lines.slice(0, 5).map((l) => `· ${l.label}: ${l.from} → ${l.to}`),
  ].join("\n");
}
