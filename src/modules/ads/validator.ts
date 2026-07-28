/**
 * Creative / keyword validator for Ads Autopilot discovery mode.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  OPTIMIZATION_GOALS_ALLOWED,
  OPTIMIZATION_GOALS_FORBIDDEN,
} from "./types";

export const DISCLAIMER_TAIL = "ИИ-наставники · 18+ · развлекательный сервис";

export const TITLE_MAX = 56;
export const TITLE2_MAX = 30;
export const TEXT_MAX = 81;

export const DISCOVERY_FREQ_MIN = 100;
export const DISCOVERY_FREQ_MAX = 5000;

/** Stop-words from Ads Autopilot plan — block creatives and keywords. */
export const STOP_WORDS = [
  "гарантия",
  "гарантируем",
  "вернём любимого",
  "вернуть любимого",
  "100%",
  "предскажем",
  "точная дата",
  "живой таролог",
  "настоящий таролог",
  "приворот",
  "порча",
  "сглаз",
  "вылечим",
  "избавим от",
  "снимем",
  "наверняка",
  "сбудется",
  "депрессия",
  "не упусти",
  "последний шанс",
  "срочно",
] as const;

export type ValidationIssue = { code: string; message: string };

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

function loadYaml<T>(rel: string): T | null {
  try {
    const path = join(process.cwd(), rel);
    if (!existsSync(path)) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require("yaml") as { parse: (s: string) => T };
    return yaml.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function getWhitelistPaths(): string[] {
  const wl = loadYaml<{ paths?: string[] }>("config/ads/landing-whitelist.yaml");
  return (wl?.paths || []).filter((p) => typeof p === "string" && !p.includes("*"));
}

export function getCompetitorBrandTerms(): string[] {
  const comp = loadYaml<{ competitors?: { brand_terms?: string[] }[] }>(
    "config/ads/competitors.yaml"
  );
  const terms: string[] = [];
  for (const c of comp?.competitors || []) {
    for (const t of c.brand_terms || []) {
      if (t) terms.push(String(t).toLowerCase());
    }
  }
  return terms;
}

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

export function findStopWords(text: string): string[] {
  const n = normalizeForMatch(text);
  return STOP_WORDS.filter((w) => n.includes(normalizeForMatch(w)));
}

export function isLandingWhitelisted(landingPath: string): boolean {
  const path = landingPath.startsWith("http")
    ? (() => {
        try {
          return new URL(landingPath).pathname.replace(/\/$/, "") || "/";
        } catch {
          return landingPath;
        }
      })()
    : (landingPath.split("?")[0] || "/").replace(/\/$/, "") || "/";
  const allowed = new Set(getWhitelistPaths().map((p) => p.replace(/\/$/, "") || "/"));
  return allowed.has(path);
}

export function validateCreative(input: {
  title: string;
  title2?: string;
  text: string;
  href: string;
}): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!input.title || input.title.length > TITLE_MAX) {
    issues.push({
      code: "title_len",
      message: `Title length must be 1–${TITLE_MAX}, got ${input.title?.length ?? 0}`,
    });
  }
  if (input.title2 && input.title2.length > TITLE2_MAX) {
    issues.push({
      code: "title2_len",
      message: `Title2 length must be ≤${TITLE2_MAX}, got ${input.title2.length}`,
    });
  }
  if (!input.text || input.text.length > TEXT_MAX) {
    issues.push({
      code: "text_len",
      message: `Text length must be 1–${TEXT_MAX}, got ${input.text?.length ?? 0}`,
    });
  }
  const blob = `${input.title} ${input.title2 || ""} ${input.text}`;
  if (!input.text.includes(DISCLAIMER_TAIL)) {
    issues.push({
      code: "disclaimer",
      message: `Creative must include disclaimer: ${DISCLAIMER_TAIL}`,
    });
  }
  const stops = findStopWords(blob);
  if (stops.length) {
    issues.push({
      code: "stop_words",
      message: `Stop-words: ${stops.join(", ")}`,
    });
  }
  if (!isLandingWhitelisted(input.href)) {
    issues.push({
      code: "landing",
      message: `Landing not in whitelist: ${input.href}`,
    });
  }
  return { ok: issues.length === 0, issues };
}

export function validateKeyword(input: {
  phrase: string;
  freq?: number | null;
  mode?: string;
}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const phrase = input.phrase || "";
  if (!phrase.trim()) {
    issues.push({ code: "empty", message: "Empty keyword" });
    return { ok: false, issues };
  }
  const stops = findStopWords(phrase);
  if (stops.length) {
    issues.push({
      code: "stop_words",
      message: `Stop-words: ${stops.join(", ")}`,
    });
  }
  const brands = getCompetitorBrandTerms();
  const n = normalizeForMatch(phrase);
  const brandHits = brands.filter((b) => n.includes(normalizeForMatch(b)));
  if (brandHits.length) {
    issues.push({
      code: "brand_terms",
      message: `Competitor brand_terms forbidden: ${brandHits.join(", ")}`,
    });
  }
  const mode = input.mode || "discovery";
  if (mode === "discovery") {
    const freq = input.freq;
    if (freq == null || Number.isNaN(freq)) {
      issues.push({
        code: "freq_missing",
        message: "Discovery requires frequency 100–5000",
      });
    } else if (freq < DISCOVERY_FREQ_MIN || freq > DISCOVERY_FREQ_MAX) {
      issues.push({
        code: "freq_range",
        message: `Discovery freq must be ${DISCOVERY_FREQ_MIN}–${DISCOVERY_FREQ_MAX}, got ${freq}`,
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateOptimizationGoal(goal: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  if ((OPTIMIZATION_GOALS_FORBIDDEN as readonly string[]).includes(goal)) {
    issues.push({
      code: "forbidden_goal",
      message: `Optimization goal forbidden: ${goal}`,
    });
  } else if (!(OPTIMIZATION_GOALS_ALLOWED as readonly string[]).includes(goal)) {
    issues.push({
      code: "unknown_goal",
      message: `Optimization goal not allowed: ${goal}`,
    });
  }
  return { ok: issues.length === 0, issues };
}
