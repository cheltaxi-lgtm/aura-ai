/**
 * Pure domain invariants for Zovus Pro.
 * S0: stubs used by verify; human-gate enforced in S1 handlers.
 */

import type { ProCaseVersionSource } from "./types";

/** Deliver requires at least one human-authored version (INV human-gate). */
export function canDeliverCase(versions: { source: ProCaseVersionSource }[]): boolean {
  return versions.some((v) => v.source === "human");
}

export function assertCanDeliver(versions: { source: ProCaseVersionSource }[]): void {
  if (!canDeliverCase(versions)) {
    const err = new Error("pro_deliver_requires_human_version");
    (err as Error & { status: number }).status = 409;
    throw err;
  }
}
