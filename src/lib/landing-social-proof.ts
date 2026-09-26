export type LandingSocialProofStat = {
  key: "users" | "total";
  value: string;
  label: string;
  live?: boolean;
};

/** Public totals come exclusively from the server; unavailable is not zero. */
export function getLandingSocialProofStats(data?: { users: number; sessions: number } | null): LandingSocialProofStat[] {
  const format = (value: number | undefined) => Number.isSafeInteger(value) && value! >= 0
    ? new Intl.NumberFormat("ru-RU").format(value!) : "—";
  return [
    { key: "users", value: format(data?.users), label: "зарегистрированы" },
    { key: "total", value: format(data?.sessions), label: "сеансов начато" },
  ];
}
