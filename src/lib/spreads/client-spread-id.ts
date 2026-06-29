import { DEFAULT_SPREAD_ID, normalizeSpreadId, SPREAD_REGISTRY } from "./registry";
import type { SpreadId } from "./types";

/** Read spread from `?spread=` or `?spreadId=` (client-only). */
export function readSpreadIdFromUrl(search?: string): SpreadId | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(search ?? window.location.search);
  const raw = (params.get("spread") ?? params.get("spreadId"))?.trim();
  if (!raw || !(raw in SPREAD_REGISTRY)) return null;
  return raw as SpreadId;
}

export function resolveClientSpreadId(
  metaSpreadId?: SpreadId | string | null
): SpreadId {
  if (metaSpreadId) return normalizeSpreadId(metaSpreadId);
  return readSpreadIdFromUrl() ?? DEFAULT_SPREAD_ID;
}

export function hasExplicitClientSpreadId(metaSpreadId?: SpreadId | string | null): boolean {
  if (metaSpreadId) return true;
  return readSpreadIdFromUrl() != null;
}
