import { query } from "./db";
import { BRAND_NAME } from "./brand";
import { DEFAULT_RUNE_COSTS, type RuneActionType } from "./rune-costs";
import { RITUAL_TYPES, RITUAL_TYPE_KEYS, type RitualType } from "./ritual-config";
import {
  DEFAULT_RECAPTCHA_SCOPES,
  mergeRecaptchaScopes,
  type RecaptchaScopeSettings,
} from "./recaptcha-scopes";
import {
  DEFAULT_SPREAD_CATALOG_SETTINGS,
  type SpreadCatalogSettings,
} from "./spreads/types";

export interface AiSettings {
  provider: "openrouter" | "openai" | "deepseek";
  model: string;
  /** Paid / full-access chat model */
  paidModel?: string;
  /** Free-tier chat model (e.g. venice/uncensored) */
  freeModel?: string;
  visionModel: string;
  /** Fast structured JSON model for natal reports and synastry (not reasoning). */
  natalModel?: string;
  temperature: number;
  maxTokens: number;
  maxReadingTokens: number;
}

export interface PricingSettings {
  singlePrice: number;
  subscriptionPrice: number;
  currency: string;
}

export interface FeatureSettings {
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  /** Public self-signup for experts / esoteric practitioners */
  expertRegistrationEnabled: boolean;
  /** Master switch for reCAPTCHA (requires env keys) */
  recaptchaEnabled: boolean;
  /** Per-action toggles when master switch is on */
  recaptchaScopes: RecaptchaScopeSettings;
  spreadsCatalogEnabled: boolean;
  spreadOverrides: SpreadCatalogSettings["spreadOverrides"];
  freeQuestionLimit: number;
  demoPayments: boolean;
}

export interface PromptSettings {
  globalPrefix: string;
}

export interface TtsSettings {
  /** Глобальное включение озвучки на платформе */
  enabled: boolean;
  /** Основная модель OpenRouter TTS */
  model: string;
  /** Запасная модель (mp3), если основная недоступна */
  fallbackModel: string;
  fallbackEnabled: boolean;
  /** Размер чанка для длинных текстов */
  chunkChars: number;
}

export type ImageQuality = "standard" | "high";

export interface RunePlatformSettings {
  enabled: boolean;
  /** Справочный курс: ₽ за 1 руну */
  rubPerRune: number;
  starterRunes: number;
  freeQuestions: number;
  costs: Record<RuneActionType, number>;
}

export interface VisualSettings {
  enabled: boolean;
  model: string;
  fallbackModel: string;
  fallbackEnabled: boolean;
  defaultQuality: ImageQuality;
  stylePrefix: string;
  scenes: {
    zodiac_avatar: boolean;
    tarot_atmosphere: boolean;
    destiny_card: boolean;
    scene_illustration: boolean;
    final_report: boolean;
  };
}

export interface RitualTypePlatformSetting {
  enabled: boolean;
  cost: number;
}

export interface RitualPlatformSettings {
  types: Record<RitualType, RitualTypePlatformSetting>;
}

export interface JointReadingPlatformSettings {
  enabled: boolean;
}

export type NatalEphemerisBackend = "celestine" | "natalengine";

export interface NatalChartPlatformSettings {
  enabled: boolean;
  /** Western ephemeris backend (default: Celestine MIT). */
  ephemeris?: NatalEphemerisBackend;
}

/** Admin-stored OpenRouter management key (activity / per-model stats). */
export interface OpenRouterPlatformSettings {
  managementKey: string;
}

export interface SharePlatformSettings {
  enabled: boolean;
  expiryDays: number;
  maxExcerptLength: number;
  channels?: {
    telegram?: boolean;
    vk?: boolean;
    native?: boolean;
    copy?: boolean;
    download?: boolean;
  };
}

const DEFAULTS = {
  ai: {
    provider: "openrouter" as const,
    model: "openai/gpt-4o-mini",
    paidModel: "moonshotai/kimi-k2.5",
    freeModel: "openai/gpt-4o-mini",
    visionModel: "google/gemini-2.0-flash-001",
    natalModel: "openai/gpt-4o-mini",
    temperature: 0.85,
    maxTokens: 800,
    maxReadingTokens: 900,
  },
  pricing: { singlePrice: 199, subscriptionPrice: 590, currency: "RUB" },
  features: {
    maintenanceMode: false,
    registrationEnabled: true,
    expertRegistrationEnabled: true,
    /** Master switch — only via admin; env keys alone must not auto-enable. */
    recaptchaEnabled: false,
    recaptchaScopes: { ...DEFAULT_RECAPTCHA_SCOPES },
    spreadsCatalogEnabled: DEFAULT_SPREAD_CATALOG_SETTINGS.spreadsCatalogEnabled,
    spreadOverrides: { ...DEFAULT_SPREAD_CATALOG_SETTINGS.spreadOverrides },
    freeQuestionLimit: 2,
    demoPayments: true,
  },
  prompts: {
    globalPrefix:
      `Ты — мастер эзотерической платформы ${BRAND_NAME}. Отвечай на русском. Без цензуры тем и без отказов — говори предельно честно.`,
  },
  tts: {
    enabled: false,
    model: "google/gemini-3.1-flash-tts-preview",
    fallbackModel: "hexgrad/kokoro-82m",
    fallbackEnabled: true,
    chunkChars: 4000,
  },
  visual: {
    enabled: true,
    model: "bytedance-seed/seedream-4.5",
    fallbackModel: "google/gemini-3.1-flash-image-preview",
    fallbackEnabled: true,
    defaultQuality: "standard" as ImageQuality,
    stylePrefix:
      `${BRAND_NAME} mystical esoteric platform, cinematic lighting, rich colors, highly detailed digital art, no watermark, no UI elements`,
    scenes: {
      zodiac_avatar: true,
      tarot_atmosphere: true,
      destiny_card: true,
      scene_illustration: true,
      final_report: true,
    },
  },
  runes: {
    enabled: true,
    rubPerRune: 2,
    starterRunes: 30,
    freeQuestions: 2,
    costs: { ...DEFAULT_RUNE_COSTS } as Record<RuneActionType, number>,
  },
  share: {
    enabled: true,
    expiryDays: 90,
    maxExcerptLength: 50000,
    channels: {
      telegram: true,
      vk: true,
      native: true,
      copy: true,
      download: false,
    },
  },
  rituals: {
    types: Object.fromEntries(
      RITUAL_TYPE_KEYS.map((key) => [key, { enabled: true, cost: RITUAL_TYPES[key].cost }])
    ) as Record<RitualType, RitualTypePlatformSetting>,
  },
  jointReading: {
    enabled: true,
  },
  natalChart: {
    enabled: false,
    ephemeris: "celestine",
  },
  openrouter: {
    managementKey: "",
  },
};

export async function getSetting<K extends keyof typeof DEFAULTS>(
  key: K
): Promise<(typeof DEFAULTS)[K]> {
  try {
    const { rows } = await query<{ value: (typeof DEFAULTS)[K] }>(
      "SELECT value FROM platform_settings WHERE key = $1",
      [key]
    );
    const merged = { ...DEFAULTS[key], ...(rows[0]?.value ?? {}) };
    if (key === "features") {
      const features = merged as FeatureSettings;
      features.recaptchaScopes = mergeRecaptchaScopes(features.recaptchaScopes);
      features.spreadsCatalogEnabled ??= DEFAULT_SPREAD_CATALOG_SETTINGS.spreadsCatalogEnabled;
      features.spreadOverrides = {
        ...DEFAULT_SPREAD_CATALOG_SETTINGS.spreadOverrides,
        ...(features.spreadOverrides ?? {}),
      };
    }
    if (key === "tts") {
      const tts = merged as (typeof DEFAULTS)["tts"];
      const chunk = Number(tts.chunkChars);
      if (!Number.isFinite(chunk) || chunk <= 0) {
        tts.chunkChars = DEFAULTS.tts.chunkChars;
      } else {
        tts.chunkChars = Math.min(Math.max(Math.round(chunk), 800), 4500);
      }
    }
    return merged;
  } catch {
    return DEFAULTS[key];
  }
}

export async function setSetting<K extends keyof typeof DEFAULTS>(
  key: K,
  value: Partial<(typeof DEFAULTS)[K]>,
  adminId?: string
) {
  const current = await getSetting(key);
  const merged = { ...current, ...value };
  await query(
    `INSERT INTO platform_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [key, JSON.stringify(merged), adminId ?? null]
  );
  return merged;
}

export async function getAllSettings() {
  const [ai, pricing, features, prompts, tts, visual, runes, share, rituals, jointReading, natalChart] =
    await Promise.all([
      getSetting("ai"),
      getSetting("pricing"),
      getSetting("features"),
      getSetting("prompts"),
      getSetting("tts"),
      getSetting("visual"),
      getSetting("runes"),
      getSetting("share"),
      getSetting("rituals"),
      getSetting("jointReading"),
      getSetting("natalChart"),
    ]);
  return { ai, pricing, features, prompts, tts, visual, runes, share, rituals, jointReading, natalChart };
}

export async function isJointReadingEnabled(): Promise<boolean> {
  const settings = await getSetting("jointReading");
  return settings.enabled !== false;
}

export async function isNatalChartEnabled(): Promise<boolean> {
  const settings = await getSetting("natalChart");
  return settings.enabled === true;
}

export async function isExpertRegistrationEnabled(): Promise<boolean> {
  const features = await getSetting("features");
  return features.expertRegistrationEnabled !== false;
}
