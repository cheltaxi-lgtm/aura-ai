import type { RitualRow } from "@/lib/ritual-service";

/** Statuses after a successful /api/ritual/[id]/pay — client should resume, not re-pay. */
export function isRitualPayAlreadyClaimed(status: string | null | undefined): boolean {
  return status === "generating" || status === "completed" || status === "reviewed";
}

export function ritualPayAlreadyDonePayload(
  ritual: RitualRow,
  balance: number,
  ritualClient: unknown
) {
  return {
    ok: true as const,
    status: ritual.status,
    ritual: ritualClient,
    balance,
    reused: true as const,
  };
}
