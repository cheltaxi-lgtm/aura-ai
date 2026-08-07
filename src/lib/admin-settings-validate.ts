import { DEFAULT_RUNE_COSTS, type RuneActionType } from "@/lib/rune-costs";

const FEATURE_BOOL_KEYS = new Set([
  "maintenanceMode",
  "registrationEnabled",
  "expertRegistrationEnabled",
  "recaptchaEnabled",
  "spreadsCatalogEnabled",
  "personalMemoryChoiceEnabled",
  "personalMemoryMoatV2Enabled",
  "personalMemoryDraftCaptureEnabled",
  "demoPayments",
]);

const FEATURE_NUMBER_KEYS = new Set([
  "freeQuestionLimit",
  "personalMemoryRolloutPercent",
  "personalMemoryMoatV2RolloutPercent",
]);

const MAX_GLOBAL_PREFIX = 4000;
const MAX_ADMIN_RUNE_GRANT = 50_000;
const MAX_STARTER_RUNES = 5_000;
const MAX_RUNE_COST = 10_000;

export function getAdminRuneGrantCap(): number {
  return MAX_ADMIN_RUNE_GRANT;
}

export function validateAdminSettingsPatch(
  section: string,
  values: unknown
): { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return { ok: false, error: "values must be an object" };
  }
  const raw = values as Record<string, unknown>;

  if (section === "prompts") {
    const keys = Object.keys(raw);
    if (!keys.every((k) => k === "globalPrefix")) {
      return { ok: false, error: "prompts only allows globalPrefix" };
    }
    if (typeof raw.globalPrefix !== "string") {
      return { ok: false, error: "globalPrefix must be a string" };
    }
    if (raw.globalPrefix.length > MAX_GLOBAL_PREFIX) {
      return { ok: false, error: `globalPrefix max ${MAX_GLOBAL_PREFIX} chars` };
    }
    return { ok: true, values: { globalPrefix: raw.globalPrefix } };
  }

  if (section === "runes") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === "enabled") {
        if (typeof val !== "boolean") return { ok: false, error: "enabled must be boolean" };
        out.enabled = val;
        continue;
      }
      if (key === "rubPerRune") {
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0.1 || n > 1000) {
          return { ok: false, error: "rubPerRune out of range" };
        }
        out.rubPerRune = n;
        continue;
      }
      if (key === "starterRunes" || key === "freeQuestions") {
        const n = Math.round(Number(val));
        if (!Number.isFinite(n) || n < 0) {
          return { ok: false, error: `${key} must be >= 0` };
        }
        if (key === "starterRunes" && n > MAX_STARTER_RUNES) {
          return { ok: false, error: `starterRunes max ${MAX_STARTER_RUNES}` };
        }
        if (key === "freeQuestions" && n > 100) {
          return { ok: false, error: "freeQuestions max 100" };
        }
        out[key] = n;
        continue;
      }
      if (key === "costs") {
        if (!val || typeof val !== "object" || Array.isArray(val)) {
          return { ok: false, error: "costs must be an object" };
        }
        const costs: Record<string, number> = {};
        for (const [action, costRaw] of Object.entries(val as Record<string, unknown>)) {
          if (!(action in DEFAULT_RUNE_COSTS)) {
            return { ok: false, error: `unknown rune cost action: ${action}` };
          }
          const cost = Math.round(Number(costRaw));
          if (!Number.isFinite(cost) || cost < 0 || cost > MAX_RUNE_COST) {
            return { ok: false, error: `invalid cost for ${action}` };
          }
          costs[action as RuneActionType] = cost;
        }
        out.costs = costs;
        continue;
      }
      return { ok: false, error: `unknown runes field: ${key}` };
    }
    return { ok: true, values: out };
  }

  if (section === "features") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === "recaptchaScopes" || key === "spreadOverrides") {
        if (!val || typeof val !== "object" || Array.isArray(val)) {
          return { ok: false, error: `${key} must be an object` };
        }
        out[key] = val;
        continue;
      }
      if (FEATURE_BOOL_KEYS.has(key)) {
        if (typeof val !== "boolean") return { ok: false, error: `${key} must be boolean` };
        out[key] = val;
        continue;
      }
      if (FEATURE_NUMBER_KEYS.has(key)) {
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0 || n > 1000) {
          return { ok: false, error: `${key} out of range` };
        }
        out[key] = n;
        continue;
      }
      return { ok: false, error: `unknown features field: ${key}` };
    }
    return { ok: true, values: out };
  }

  if (section === "pricing") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === "currency") {
        if (typeof val !== "string" || val.length > 8) {
          return { ok: false, error: "invalid currency" };
        }
        out.currency = val;
        continue;
      }
      if (key === "singlePrice" || key === "subscriptionPrice") {
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
          return { ok: false, error: `${key} out of range` };
        }
        out[key] = n;
        continue;
      }
      return { ok: false, error: `unknown pricing field: ${key}` };
    }
    return { ok: true, values: out };
  }

  if (section === "ai") {
    const out: Record<string, unknown> = {};
    const stringKeys = [
      "provider",
      "model",
      "paidModel",
      "freeModel",
      "visionModel",
      "natalModel",
      "matrixModel",
      "hdModel",
    ] as const;
    for (const [key, val] of Object.entries(raw)) {
      if (stringKeys.includes(key as (typeof stringKeys)[number])) {
        if (typeof val !== "string" || val.length > 120) {
          return { ok: false, error: `${key} must be a short string` };
        }
        out[key] = val;
        continue;
      }
      if (
        key === "fallbackModels" ||
        key === "natalFallbackModels" ||
        key === "matrixFallbackModels"
      ) {
        if (!Array.isArray(val) || !val.every((v) => typeof v === "string" && v.length <= 120)) {
          return { ok: false, error: `${key} must be string[]` };
        }
        if (val.length > 12) return { ok: false, error: `${key} max 12 models` };
        out[key] = val;
        continue;
      }
      if (key === "temperature") {
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0 || n > 2) {
          return { ok: false, error: "temperature out of range" };
        }
        out.temperature = n;
        continue;
      }
      if (key === "maxTokens" || key === "maxReadingTokens") {
        const n = Math.round(Number(val));
        if (!Number.isFinite(n) || n < 64 || n > 16_000) {
          return { ok: false, error: `${key} out of range` };
        }
        out[key] = n;
        continue;
      }
      return { ok: false, error: `unknown ai field: ${key}` };
    }
    return { ok: true, values: out };
  }

  if (section === "tts") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === "enabled" || key === "fallbackEnabled") {
        if (typeof val !== "boolean") return { ok: false, error: `${key} must be boolean` };
        out[key] = val;
        continue;
      }
      if (key === "model" || key === "fallbackModel") {
        if (typeof val !== "string" || val.length > 120) {
          return { ok: false, error: `${key} must be a short string` };
        }
        out[key] = val;
        continue;
      }
      if (key === "chunkChars") {
        const n = Math.round(Number(val));
        if (!Number.isFinite(n) || n < 800 || n > 4500) {
          return { ok: false, error: "chunkChars out of range" };
        }
        out.chunkChars = n;
        continue;
      }
      return { ok: false, error: `unknown tts field: ${key}` };
    }
    return { ok: true, values: out };
  }

  if (section === "visual") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === "enabled" || key === "fallbackEnabled") {
        if (typeof val !== "boolean") return { ok: false, error: `${key} must be boolean` };
        out[key] = val;
        continue;
      }
      if (key === "model" || key === "fallbackModel") {
        if (typeof val !== "string" || val.length > 120) {
          return { ok: false, error: `${key} must be a short string` };
        }
        out[key] = val;
        continue;
      }
      if (key === "defaultQuality") {
        if (val !== "standard" && val !== "high") {
          return { ok: false, error: "defaultQuality must be standard|high" };
        }
        out.defaultQuality = val;
        continue;
      }
      if (key === "stylePrefix") {
        if (typeof val !== "string" || val.length > 2000) {
          return { ok: false, error: "stylePrefix too long" };
        }
        out.stylePrefix = val;
        continue;
      }
      if (key === "scenes") {
        if (!val || typeof val !== "object" || Array.isArray(val)) {
          return { ok: false, error: "scenes must be an object" };
        }
        const scenes: Record<string, boolean> = {};
        for (const [scene, on] of Object.entries(val as Record<string, unknown>)) {
          if (
            ![
              "zodiac_avatar",
              "tarot_atmosphere",
              "destiny_card",
              "scene_illustration",
              "final_report",
            ].includes(scene)
          ) {
            return { ok: false, error: `unknown scene: ${scene}` };
          }
          if (typeof on !== "boolean") {
            return { ok: false, error: `scene ${scene} must be boolean` };
          }
          scenes[scene] = on;
        }
        out.scenes = scenes;
        continue;
      }
      return { ok: false, error: `unknown visual field: ${key}` };
    }
    return { ok: true, values: out };
  }

  if (section === "share") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === "enabled") {
        if (typeof val !== "boolean") return { ok: false, error: "enabled must be boolean" };
        out.enabled = val;
        continue;
      }
      if (key === "expiryDays") {
        const n = Math.round(Number(val));
        if (!Number.isFinite(n) || n < 1 || n > 365) {
          return { ok: false, error: "expiryDays out of range" };
        }
        out.expiryDays = n;
        continue;
      }
      if (key === "maxExcerptLength") {
        const n = Math.round(Number(val));
        if (!Number.isFinite(n) || n < 100 || n > 20_000) {
          return { ok: false, error: "maxExcerptLength out of range" };
        }
        out.maxExcerptLength = n;
        continue;
      }
      if (key === "channels") {
        if (!val || typeof val !== "object" || Array.isArray(val)) {
          return { ok: false, error: "channels must be an object" };
        }
        const channels: Record<string, boolean> = {};
        for (const [ch, on] of Object.entries(val as Record<string, unknown>)) {
          if (!["telegram", "vk", "native", "copy", "download"].includes(ch)) {
            return { ok: false, error: `unknown channel: ${ch}` };
          }
          if (typeof on !== "boolean") {
            return { ok: false, error: `channel ${ch} must be boolean` };
          }
          channels[ch] = on;
        }
        out.channels = channels;
        continue;
      }
      return { ok: false, error: `unknown share field: ${key}` };
    }
    return { ok: true, values: out };
  }

  if (section === "aiDelivery") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === "enabledKinds" || key === "pilotAccountIds") {
        if (!Array.isArray(val) || !val.every((v) => typeof v === "string" && v.length <= 80)) {
          return { ok: false, error: `${key} must be string[]` };
        }
        if (val.length > 100) return { ok: false, error: `${key} max 100` };
        out[key] = val;
        continue;
      }
      if (key === "maxJobAgeMinutes") {
        const n = Math.round(Number(val));
        if (!Number.isFinite(n) || n < 5 || n > 24 * 60) {
          return { ok: false, error: "maxJobAgeMinutes out of range" };
        }
        out.maxJobAgeMinutes = n;
        continue;
      }
      if (key === "maxAttempts") {
        const n = Math.round(Number(val));
        if (!Number.isFinite(n) || n < 1 || n > 10) {
          return { ok: false, error: "maxAttempts out of range" };
        }
        out.maxAttempts = n;
        continue;
      }
      return { ok: false, error: `unknown aiDelivery field: ${key}` };
    }
    return { ok: true, values: out };
  }

  // natalChart validated in route
  return { ok: true, values: raw };
}
