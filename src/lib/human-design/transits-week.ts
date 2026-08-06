import { computeTransits } from "./calculate";
import type { HdActivation } from "./types";

export interface HdTransitDay {
  at: string;
  dateLabel: string;
  activations: HdActivation[];
}

const DAY_MS = 86_400_000;

/** Deterministic week-ahead transit snapshots (noon UTC offset from start). */
export function computeTransitWeek(
  fromMs: number = Date.now(),
  days = 7
): HdTransitDay[] {
  const start = new Date(fromMs);
  start.setHours(12, 0, 0, 0);
  const out: HdTransitDay[] = [];
  for (let i = 0; i < days; i++) {
    const atMs = start.getTime() + i * DAY_MS;
    const at = new Date(atMs);
    out.push({
      at: at.toISOString(),
      dateLabel: at.toLocaleDateString("ru-RU", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      activations: computeTransits(atMs),
    });
  }
  return out;
}
