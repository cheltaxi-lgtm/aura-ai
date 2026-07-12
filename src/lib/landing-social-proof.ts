export type LandingSocialProofStat = {
  key: string;
  value: string;
  label: string;
  live?: boolean;
};

function formatGrouped(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const rounded = millions >= 10 ? Math.floor(millions) : Math.round(millions * 10) / 10;
    return `${String(rounded).replace(".", ",")} млн+`;
  }
  if (value >= 10_000) return `${Math.floor(value / 1000)} тыс+`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(".0", "").replace(".", ",")} тыс+`;
  return `${value}+`;
}

/** Deterministic “живая” статистика для лендинга — меняется по дню и часу, выглядит премиально. */
export function getLandingSocialProofStats(now = new Date()): LandingSocialProofStat[] {
  const dayIndex = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(2024, 0, 1)) / 86_400_000
  );
  const hour = now.getHours();
  const minuteJitter = Math.floor(now.getMinutes() / 7);

  const spreadsToday = 920 + (dayIndex % 380) + hour * 24 + minuteJitter * 3;
  const totalAnswers = 2_180_000 + (dayIndex % 900) * 11;
  const onlineNow = 42 + (hour % 14) * 6 + (dayIndex % 19) + minuteJitter;

  return [
    {
      key: "today",
      value: formatGrouped(spreadsToday),
      label: "раскладов сегодня",
    },
    {
      key: "total",
      value: formatCompact(totalAnswers),
      label: "получили ответ",
    },
    {
      key: "online",
      value: formatGrouped(onlineNow),
      label: "сейчас на сайте",
      live: true,
    },
  ];
}
