/** Display label for an HD chart chip / header. */

export function formatHdBirthDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function hdChartChipLabel(chart: {
  subjectKind?: string | null;
  subjectName?: string | null;
  birthDate: string;
}): string {
  const date = formatHdBirthDate(chart.birthDate);
  if (chart.subjectKind === "other") {
    const name = chart.subjectName?.trim();
    return name ? `${name} · ${date}` : `Другой · ${date}`;
  }
  return `Я · ${date}`;
}
