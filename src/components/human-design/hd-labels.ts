/** Display label for an HD chart chip / header. */

export function formatHdBirthDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function hdChartChipLabel(chart: {
  subjectKind?: string | null;
  subjectName?: string | null;
  birthDate?: string | null;
}): string {
  const date = chart.birthDate ? formatHdBirthDate(chart.birthDate) : null;
  if (chart.subjectKind === "other") {
    const name = chart.subjectName?.trim();
    if (name && date) return `${name} · ${date}`;
    if (name) return name;
    return date ? `Другой · ${date}` : "Другой";
  }
  return date ? `Я · ${date}` : "Я";
}
