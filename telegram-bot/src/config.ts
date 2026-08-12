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

function resolveDeckDir(): string {
  const override =
    process.env.BOT_DECK_PATH?.trim() || process.env.BOT_DECK_ASSETS?.trim() || "";
  if (!override) return resolve(rootDir, "assets/decks/tarot-veronika");
  return resolve(rootDir, override);
}

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
  /** Deck images. Default: package-local assets. Override via BOT_DECK_PATH. */
  deckAssetsDir: resolveDeckDir(),
  /** Guest session / tg_receipt TTL. Default 7 days (168h) for claim window. */
  sessionTtlMs: int("BOT_SESSION_TTL_HOURS", 168) * 60 * 60 * 1000,
  /** Legacy guest SQLite quota only — not used for linked site product spreads. */
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
  plainTokenPrefixLen: int("BOT_PLAIN_TOKEN_PREFIX_LEN", 6),
  skipAssetCheck: bool("BOT_SKIP_ASSET_CHECK", false),
  /** Shared secret for aura-ai ↔ bot internal API. Empty = endpoints disabled. */
  internalSecret: process.env.BOT_INTERNAL_SECRET?.trim() || "",
  /** Site base for bot→site thin client (loopback on Beget). */
  siteInternalBaseUrl: (
    process.env.SITE_INTERNAL_BASE_URL?.trim() ||
    process.env.ZOVUS_SITE_INTERNAL_URL?.trim() ||
    "http://127.0.0.1:3000"
  ).replace(/\/$/, ""),
  /** When true, product actions require linked Zovus account (site SoT). */
  requireSiteAccount: bool("BOT_REQUIRE_SITE_ACCOUNT", true),
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

/** Fail closed on prod misconfig before the bot accepts updates. */
export function assertBotRuntimeGuards(): void {
  // Re-read env at call time (startup) so guards match the process environment.
  const mode = (process.env.BOT_MODE?.trim() || "polling") as "polling" | "webhook";
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim() || "";
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
  if (mode === "webhook") {
    if (!webhookUrl) {
      throw new Error("TELEGRAM_WEBHOOK_URL required in webhook mode");
    }
    if (webhookSecret.length < 32) {
      throw new Error(
        "TELEGRAM_WEBHOOK_SECRET required in webhook mode (min 32 chars)"
      );
    }
  }
  if (process.env.NODE_ENV === "production" && !bool("BOT_REQUIRE_SITE_ACCOUNT", true)) {
    throw new Error(
      "BOT_REQUIRE_SITE_ACCOUNT=false is forbidden in production (site SoT)"
    );
  }
}
