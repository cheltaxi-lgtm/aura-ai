import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { botConfig } from "../../config.js";
import { trackEvent } from "../../db/repos.js";
import { FULL_DECK } from "./cards.js";

const EXTS = ["webp", "png", "jpg"] as const;

/** Declarative expected slugs: 78 cards + back. */
export function expectedDeckSlugs(): string[] {
  return ["_back", ...FULL_DECK.map((c) => c.slug)];
}

export function resolveAssetPath(dir: string, slug: string): string | null {
  for (const ext of EXTS) {
    const p = resolve(dir, `${slug}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

export function findMissingDeckAssets(dir: string = botConfig.deckAssetsDir): string[] {
  return expectedDeckSlugs().filter((slug) => !resolveAssetPath(dir, slug));
}

export type DeckIntegrity = {
  ok: boolean;
  expected: number;
  missing: string[];
  dir: string;
};

export function checkDeckIntegrity(dir: string = botConfig.deckAssetsDir): DeckIntegrity {
  const missing = findMissingDeckAssets(dir);
  return {
    ok: missing.length === 0,
    expected: expectedDeckSlugs().length,
    missing,
    dir,
  };
}

/** Exit process if deck incomplete (unless BOT_SKIP_ASSET_CHECK). */
export function assertDeckAssetsOrExit(): void {
  if (botConfig.skipAssetCheck) {
    console.warn("[assets] BOT_SKIP_ASSET_CHECK=1 — skipping deck integrity check");
    return;
  }
  const result = checkDeckIntegrity();
  if (result.ok) {
    console.log(`[assets] deck ok: ${result.expected} files in ${result.dir}`);
    return;
  }
  console.error(
    `[assets] FATAL: missing ${result.missing.length}/${result.expected} deck assets in ${result.dir}`
  );
  console.error(`[assets] missing slugs:\n  ${result.missing.join("\n  ")}`);
  process.exit(1);
}

type Alerter = (slug: string) => void | Promise<void>;
let alerter: Alerter | null = null;
const lastAlertAt = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export function setAssetMissingAlerter(fn: Alerter | null): void {
  alerter = fn;
}

/** Runtime missing face: event + throttled admin alert. */
export function reportAssetMissing(slug: string): void {
  trackEvent("asset_missing", null, { slug });
  const now = Date.now();
  const prev = lastAlertAt.get(slug) ?? 0;
  if (now - prev < ALERT_COOLDOWN_MS) return;
  lastAlertAt.set(slug, now);
  if (!alerter) return;
  void Promise.resolve(alerter(slug)).catch((err) =>
    console.error("[assets] alert failed", err)
  );
}
