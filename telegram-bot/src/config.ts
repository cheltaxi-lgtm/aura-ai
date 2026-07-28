import { config as loadEnv } from "dotenv";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(rootDir, "..");
loadEnv({ path: resolve(rootDir, ".env") });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}. Copy .env.example → .env`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw == null || raw === "") return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const dataDir = resolve(rootDir, process.env.BOT_DATA_DIR?.trim() || "data");
mkdirSync(dataDir, { recursive: true });
mkdirSync(resolve(dataDir, "collage-cache"), { recursive: true });
mkdirSync(resolve(dataDir, "backups"), { recursive: true });

export const botConfig = {
  rootDir,
  repoRoot,
  dataDir,
  collageCacheDir: resolve(dataDir, "collage-cache"),
  backupDir: resolve(dataDir, "backups"),
  lockPath: resolve(dataDir, "bot.lock"),
  token: required("TELEGRAM_BOT_TOKEN"),
  siteUrl: (process.env.ZOVUS_SITE_URL?.trim() || "https://zovus.ru").replace(/\/$/, ""),
  ctaTargetUrl: (process.env.BOT_CTA_TARGET_URL?.trim() || "https://zovus.ru").replace(/\/$/, ""),
  publicBaseUrl: (process.env.BOT_PUBLIC_BASE_URL?.trim() || "").replace(/\/$/, ""),
  brandName: "Zovus",
  masterId: "veronika",
  masterName: "Вероника",
  system: "tarot-veronika" as const,
  deckId: "tarot-veronika",
  spreadId: "triplet",
  consentVersion: process.env.BOT_CONSENT_VERSION?.trim() || "2026-07-1",
  timezone: process.env.BOT_TZ?.trim() || "Europe/Moscow",
  mode: (process.env.BOT_MODE?.trim() || "polling") as "polling" | "webhook",
  webhookUrl: process.env.TELEGRAM_WEBHOOK_URL?.trim() || "",
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "",
  webhookPort: int("BOT_WEBHOOK_PORT", 8787),
  httpAlways: bool("BOT_HTTP_ALWAYS", true),
  dbPath: resolve(dataDir, process.env.BOT_DB_NAME?.trim() || "bot.sqlite"),
  deckAssetsDir: resolve(
    repoRoot,
    process.env.BOT_DECK_ASSETS?.trim() || "public/decks/tarot-veronika"
  ),
  sessionTtlMs: int("BOT_SESSION_TTL_HOURS", 24) * 60 * 60 * 1000,
  tripletDailyLimit: int("BOT_TRIPLET_DAILY_LIMIT", 1),
  rateLimitPerMinute: int("BOT_RATE_LIMIT_PER_MIN", 20),
  abandonedHours: int("BOT_ABANDONED_HOURS", 3),
  openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || "",
  openRouterModel: process.env.BOT_TEASER_MODEL?.trim() || "openai/gpt-4o-mini",
  ttsApiKey: process.env.BOT_TTS_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim() || "",
  ttsModel: process.env.BOT_TTS_MODEL?.trim() || "openai/gpt-4o-mini-tts",
  ttsVoice: process.env.BOT_TTS_VOICE?.trim() || "nova",
  ttsMaxSeconds: int("BOT_TTS_MAX_SECONDS", 35),
  llmDailyCap: int("BOT_LLM_DAILY_CAP", 20),
  ttsDailyCap: int("BOT_TTS_DAILY_CAP", 10),
  adminChatId: int("BOT_ADMIN_CHAT_ID", 0),
  botUsername: process.env.BOT_USERNAME?.trim() || "zovus_card_bot",
  ritual: {
    pauseMsMin: int("BOT_RITUAL_PAUSE_MS_MIN", 2000),
    pauseMsMax: int("BOT_RITUAL_PAUSE_MS_MAX", 4000),
    revealGapMsMin: int("BOT_RITUAL_REVEAL_GAP_MS_MIN", 1500),
    revealGapMsMax: int("BOT_RITUAL_REVEAL_GAP_MS_MAX", 2500),
    ctaPauseMs: int("BOT_RITUAL_CTA_PAUSE_MS", 1200),
  },
  flags: {
    botEnabled: bool("BOT_ENABLED", true),
    dayCardEnabled: bool("BOT_DAY_CARD_ENABLED", true),
    remindersEnabled: bool("BOT_REMINDERS_ENABLED", true),
    ritualRevealEnabled: bool("BOT_RITUAL_REVEAL_ENABLED", true),
    ttsEnabled: bool("BOT_TTS_ENABLED", true),
    llmEnabled: bool("BOT_LLM_ENABLED", true),
    shareCardEnabled: bool("BOT_SHARE_CARD_ENABLED", true),
    weeklyDigestEnabled: bool("BOT_WEEKLY_DIGEST_ENABLED", false),
  },
} as const;
