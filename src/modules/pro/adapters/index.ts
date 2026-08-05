/**
 * Bridges to existing product capabilities.
 * S0: stubs with isAvailable() — no product side-effects.
 */

export type ProAdapter = {
  id: string;
  isAvailable(): boolean;
};

function envOn(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** LLM draft generation — off until PRO_AI_ENABLED. */
export const aiAdapter: ProAdapter = {
  id: "ai",
  isAvailable: () => envOn("PRO_MODULE_ENABLED") && envOn("PRO_AI_ENABLED"),
};

/** Rune ledger billing — shadow/live controlled separately in S1. */
export const billingAdapter: ProAdapter = {
  id: "billing",
  isAvailable: () => envOn("PRO_MODULE_ENABLED"),
};

/** Geocoding / IANA tz for client birth data. */
export const geocodeAdapter: ProAdapter = {
  id: "geocode",
  isAvailable: () => envOn("PRO_MODULE_ENABLED"),
};

/** Natal engine. */
export const natalAdapter: ProAdapter = {
  id: "natal",
  isAvailable: () => envOn("PRO_MODULE_ENABLED"),
};

/** Destiny matrix engine. */
export const matrixAdapter: ProAdapter = {
  id: "matrix",
  isAvailable: () => envOn("PRO_MODULE_ENABLED"),
};

export const PRO_ADAPTERS: readonly ProAdapter[] = [
  aiAdapter,
  billingAdapter,
  geocodeAdapter,
  natalAdapter,
  matrixAdapter,
];
