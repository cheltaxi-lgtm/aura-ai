/**
 * Zovus AI harness catalog — maps products to existing npm/scripts.
 * Add a product here; do not invent parallel test runners.
 */
export const LEVELS = ["fast", "full", "production"];

export const CHECKS = {
  typecheck: { title: "typecheck", npm: "typecheck" },
  lint: { title: "lint", npm: "lint", expensive: true },
  guards: { title: "guards", npm: "guards" },
  guardrails: { title: "guardrails", npm: "verify:guardrails" },
  build: { title: "build", npm: "build", expensive: true },

  "matrix-verify": { title: "matrix-verify", npm: "verify:destiny-matrix" },
  "matrix-invariants": { title: "matrix-invariants", npm: "verify:destiny-matrix-invariants" },
  "matrix-sectioned": { title: "matrix-sectioned", npm: "verify:matrix-sectioned" },
  "matrix-drift": { title: "matrix-calc-drift", npm: "verify:matrix-calc-drift" },
  "matrix-unit": {
    title: "matrix-unit",
    // Vitest 4 treats `matrix-*.test.ts` as a literal filter (no files). Prefix match works.
    vitest: ["tests/invariants/matrix"],
  },
  "e2e-matrix": {
    title: "e2e-matrix",
    cmd: ["npx", "playwright", "test", "--project=matrix-e2e"],
    expensive: true,
  },

  "natal-chart": { title: "natal-chart", npm: "verify:natal-chart" },
  "natal-jobs": { title: "async-natal-jobs", npm: "verify:async-natal-jobs" },
  "natal-unit": {
    title: "natal-unit",
    // Vitest 4 treats `natal-*.test.ts` as a literal filter (no files). Explicit paths work on Windows.
    vitest: [
      "tests/invariants/natal-forecast-depth.test.ts",
      "tests/invariants/natal-forecast-memory.test.ts",
      "tests/invariants/natal-forecast-salvage.test.ts",
      "tests/invariants/natal-report-quality.test.ts",
      "tests/invariants/natal-guest-continuity.test.ts",
      "tests/invariants/natal-exact-report-ownership.test.ts",
    ],
  },
  "e2e-natal": {
    title: "e2e-natal",
    cmd: ["npx", "playwright", "test", "tests/e2e/natal.public.spec.ts", "tests/e2e/natal-guest.public.spec.ts", "--project=public-chromium"],
    expensive: true,
  },

  "hd-verify": { title: "human-design", npm: "verify:human-design" },
  "hd-connection": { title: "hd-connection", npm: "verify:hd-connection" },
  "hd-unit": { title: "hd-unit", vitest: ["tests/invariants/hd-*.test.ts"] },

  "tarot-spreads": { title: "spreads", npm: "test:spreads" },
  "tarot-share": { title: "share", npm: "test:share" },
  "guest-resume": { title: "guest-triplet-resume", npm: "verify:guest-triplet-resume" },
  "guest-state": { title: "guest-resume-state", npm: "verify:guest-resume-state" },
  "prompt-hygiene": { title: "prompt-hygiene", npm: "verify:prompt-hygiene" },
  "dark-reading": { title: "dark-reading", npm: "verify:dark-reading" },
  "chat-quality": { title: "chat-quality", npm: "verify:chat-quality" },
  "e2e-guest-mobile": {
    title: "e2e-guest-triplet-mobile",
    cmd: ["npx", "playwright", "test", "--project=guest-triplet-mobile"],
    expensive: true,
  },
  "e2e-guest-funnel": {
    title: "e2e-guest-funnel",
    cmd: ["npx", "playwright", "test", "--project=guest-funnel-golden"],
    expensive: true,
  },

  "photo-reading": { title: "photo-reading", npm: "test:photo-reading" },
  "photo-aliases": { title: "photo-aliases", npm: "verify:photo-aliases" },
  "photo-unit": { title: "photo-unit", vitest: ["tests/invariants/photo-*.test.ts"] },

  "seo-ask": { title: "seo-ask-spread", npm: "verify:seo-ask-spread" },
  "seo-teaser": { title: "guest-teaser-quality", npm: "verify:guest-teaser-quality" },
  "seo-unit": {
    title: "seo-unit",
    vitest: [
      "tests/invariants/seo-growth-pass.test.ts",
      "tests/invariants/multiproduct-seo-discoverability.test.ts",
      "tests/invariants/spread-intent-match-question.test.ts",
      "tests/invariants/ads-seo-overrides.test.ts",
    ],
  },
  "ads-unit": {
    title: "ads-unit",
    cmd: ["npx", "tsx", "src/modules/ads/__tests__/ads-unit.ts"],
  },

  "telegram-typecheck": { title: "telegram-typecheck", cmd: ["npm", "run", "typecheck"], cwd: "telegram-bot" },
  "telegram-test": { title: "telegram-test", cmd: ["npm", "test"], cwd: "telegram-bot" },
  "telegram-unit": {
    title: "telegram-unit",
    vitest: [
      "tests/invariants/telegram-bot-bridge.test.ts",
      "tests/invariants/bot-*.test.ts",
    ],
  },

  "invariants-all": { title: "invariants", npm: "test:invariants", expensive: true },
  "product-suite": { title: "product-suite", npm: "test", expensive: true },
  oauth: { title: "oauth", npm: "verify:oauth" },
  "account-deleted": { title: "account-deleted", npm: "verify:account-deleted" },
  recaptcha: { title: "recaptcha", npm: "test:recaptcha" },
  "app-shell": { title: "app-shell", npm: "verify:app-shell" },
  "ai-delivery": { title: "ai-delivery", npm: "verify:ai-delivery" },

  "prod-health": { title: "prod-health", builtin: "prod-health" },
  "prod-smoke": { title: "prod-smoke", builtin: "prod-smoke" },
  "harness-validate": { title: "harness-validate", builtin: "validate" },
};

const CORE_FAST = ["typecheck", "guards"];
const CORE_FULL = ["typecheck", "guards", "lint", "guardrails"];

export const SCOPES = {
  matrix: {
    title: "Destiny Matrix",
    paths: /matrix|destiny-matrix|numerology/i,
    smokeUrls: ["https://zovus.ru/matrix-destiny"],
    reviews: ["code", "calc", "visual", "security"],
    fast: [...CORE_FAST, "matrix-verify", "matrix-invariants", "matrix-sectioned", "matrix-drift"],
    full: [...CORE_FULL, "matrix-verify", "matrix-invariants", "matrix-sectioned", "matrix-drift", "matrix-unit", "e2e-matrix"],
    production: ["prod-health", "prod-smoke"],
  },
  natal: {
    title: "Natal",
    paths: /natal|astrology|synastry/i,
    smokeUrls: ["https://zovus.ru/natalnaya-karta"],
    reviews: ["code", "calc", "visual", "security"],
    fast: [...CORE_FAST, "natal-chart", "natal-jobs", "natal-unit"],
    full: [...CORE_FULL, "natal-chart", "natal-jobs", "natal-unit", "ai-delivery", "e2e-natal"],
    production: ["prod-health", "prod-smoke"],
  },
  hd: {
    title: "Human Design",
    paths: /human-design|dizayn-cheloveka|(^|\/)hd[-_/]/i,
    smokeUrls: ["https://zovus.ru/dizayn-cheloveka"],
    reviews: ["code", "calc", "visual", "security"],
    fast: [...CORE_FAST, "hd-verify", "hd-connection"],
    full: [...CORE_FULL, "hd-verify", "hd-connection", "hd-unit"],
    production: ["prod-health", "prod-smoke"],
  },
  tarot: {
    title: "Tarot / guest triplet",
    paths: /tarot|taro|rasklad|spreads|decks?\b|guest-triplet|guest-resume/i,
    smokeUrls: ["https://zovus.ru/taro", "https://zovus.ru/rasklad"],
    reviews: ["code", "visual", "security"],
    fast: [...CORE_FAST, "tarot-spreads", "guest-resume", "guest-state", "prompt-hygiene"],
    full: [...CORE_FULL, "tarot-spreads", "tarot-share", "guest-resume", "guest-state", "prompt-hygiene", "dark-reading", "chat-quality", "e2e-guest-mobile", "e2e-guest-funnel"],
    production: ["prod-health", "prod-smoke"],
  },
  photo: {
    title: "Photo reading",
    paths: /photo-rasklad|photo-reading|photo-alias/i,
    smokeUrls: ["https://zovus.ru/photo-rasklad"],
    reviews: ["code", "visual", "security"],
    fast: [...CORE_FAST, "photo-reading", "photo-aliases"],
    full: [...CORE_FULL, "photo-reading", "photo-aliases", "photo-unit"],
    production: ["prod-health", "prod-smoke"],
  },
  seo: {
    title: "SEO / landings",
    paths: /\/seo\/|sitemap|robots\.txt|seo-ask|seo-growth|multiproduct-seo/i,
    smokeUrls: ["https://zovus.ru/", "https://zovus.ru/gadanie"],
    reviews: ["code", "visual"],
    fast: [...CORE_FAST, "seo-ask", "seo-unit"],
    full: [...CORE_FULL, "seo-ask", "seo-teaser", "seo-unit"],
    production: ["prod-health", "prod-smoke"],
  },
  ads: {
    title: "Ads / promotion",
    paths: /modules\/ads|admin\/ads|cron\/ads|config\/ads|ads-unit/i,
    smokeUrls: ["https://zovus.ru/taro"],
    reviews: ["code", "security"],
    fast: [...CORE_FAST, "ads-unit", "seo-unit"],
    full: [...CORE_FULL, "ads-unit", "seo-unit"],
    production: ["prod-health"],
  },
  telegram: {
    title: "Telegram bot",
    paths: /telegram-bot/i,
    smokeUrls: [],
    reviews: ["code", "security"],
    fast: ["telegram-typecheck", "telegram-test"],
    full: ["telegram-typecheck", "telegram-test", "telegram-unit"],
    production: ["prod-health"],
  },
  production: {
    title: "Production",
    paths: /hosting\/|deploy-prod|caddy|proxmox-setup/i,
    smokeUrls: [
      "https://zovus.ru/api/health",
      "https://zovus.ru/",
      "https://zovus.ru/taro",
      "https://zovus.ru/natalnaya-karta",
      "https://zovus.ru/dizayn-cheloveka",
      "https://zovus.ru/matrix-destiny",
      "https://zovus.ru/photo-rasklad",
    ],
    reviews: ["production", "security"],
    fast: ["typecheck", "guards", "prod-health"],
    full: [...CORE_FULL, "prod-health", "prod-smoke"],
    production: ["prod-health", "prod-smoke"],
  },
  harness: {
    title: "AI harness",
    paths: /ai-harness|\.cursor\/(rules|skills|commands|agents|hooks)/i,
    smokeUrls: [],
    reviews: ["code"],
    fast: ["harness-validate"],
    full: ["harness-validate", "guards"],
    production: [],
  },
  full: {
    title: "Full repo",
    paths: /./,
    smokeUrls: [
      "https://zovus.ru/api/health",
      "https://zovus.ru/",
      "https://zovus.ru/taro",
      "https://zovus.ru/natalnaya-karta",
      "https://zovus.ru/dizayn-cheloveka",
      "https://zovus.ru/matrix-destiny",
      "https://zovus.ru/photo-rasklad",
    ],
    reviews: ["code", "calc", "visual", "security", "production"],
    fast: [...CORE_FAST, "guardrails"],
    full: [...CORE_FULL, "product-suite", "invariants-all", "telegram-test", "oauth", "account-deleted", "build"],
    production: ["prod-health", "prod-smoke"],
  },
};

export const PATH_SCOPES = [
  "harness",
  "production",
  "telegram",
  "matrix",
  "natal",
  "hd",
  "photo",
  "seo",
  "ads",
  "tarot",
];

export const REVIEW_IDS = ["code", "calc", "visual", "security", "production"];

export const STATE_PATH = ".cursor/harness-state.json";
