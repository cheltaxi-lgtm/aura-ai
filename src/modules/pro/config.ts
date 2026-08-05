/**
 * Zovus Pro feature flags (ENV). Defaults keep the module dark (S0).
 * PRO_CRISIS_GATE_ENABLED must stay true — never disable in production.
 */

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw == null || raw === "") return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export type ProBillingMode = "shadow" | "live";
export type ProDialogModeMax = "a" | "b" | "c";

export function isProModuleEnabled(): boolean {
  return boolEnv("PRO_MODULE_ENABLED", false);
}

export function isProAiEnabled(): boolean {
  return isProModuleEnabled() && boolEnv("PRO_AI_ENABLED", false);
}

export function getProBillingMode(): ProBillingMode {
  const raw = (process.env.PRO_BILLING_MODE?.trim() || "shadow").toLowerCase();
  return raw === "live" ? "live" : "shadow";
}

export function isProDeliveryEnabled(): boolean {
  return isProModuleEnabled() && boolEnv("PRO_DELIVERY_ENABLED", false);
}

export function getProDialogModeMax(): ProDialogModeMax {
  const raw = (process.env.PRO_DIALOG_MODE_MAX?.trim() || "b").toLowerCase();
  if (raw === "a" || raw === "c") return raw;
  return "b";
}

export function isProPortalEnabled(): boolean {
  return isProModuleEnabled() && boolEnv("PRO_PORTAL_ENABLED", false);
}

export function isProFollowupEnabled(): boolean {
  return isProModuleEnabled() && boolEnv("PRO_FOLLOWUP_ENABLED", false);
}

export function isProTranscriptsEnabled(): boolean {
  return isProModuleEnabled() && boolEnv("PRO_TRANSCRIPTS_ENABLED", false);
}

export function isProVisionEnabled(): boolean {
  return isProModuleEnabled() && boolEnv("PRO_VISION_ENABLED", false);
}

export function isProTtsEnabled(): boolean {
  return isProModuleEnabled() && boolEnv("PRO_TTS_ENABLED", false);
}

/** Crisis gate — product invariant; default true, do not turn off. */
export function isProCrisisGateEnabled(): boolean {
  return boolEnv("PRO_CRISIS_GATE_ENABLED", true);
}

export function getProMaxCasesPerDay(): number {
  return intEnv("PRO_MAX_CASES_PER_DAY", 50);
}

export function getProMaxClients(): number {
  return intEnv("PRO_MAX_CLIENTS", 200);
}

/** Comma/space-separated user UUIDs allowed in S1. Empty = no allowlist bypass. */
export function getProAllowlistUserIds(): string[] {
  const raw = process.env.PRO_ALLOWLIST_USER_IDS?.trim() || "";
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isProAllowlistedUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const list = getProAllowlistUserIds();
  if (list.length === 0) return false;
  return list.includes(userId);
}
