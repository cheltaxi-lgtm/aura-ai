import { createHash } from "node:crypto";

import type { AsyncJobKind, AsyncJobRow } from "@/lib/async-jobs";
import type { RuneActionType } from "@/lib/rune-costs";

export type PaidJobKindConfig = {
  kind: AsyncJobKind;
  /** Default rune action; route may override for free/owned paths. */
  runeAction?: RuneActionType;
  maxActivePerUser: number;
  timeoutMs: number;
  workerPath: (job: AsyncJobRow) => { path: string; body: Record<string, unknown> };
  /** Pathname matcher for middleware worker auth. */
  matchesWorkerPath: (pathname: string) => boolean;
  /** Stable dedupe key for active-job uniqueness. */
  buildDedupeKey: (userId: string, payload: Record<string, unknown>) => string;
  /**
   * "background_notified" — клиент показывает экран «Отчёт принят» и отпускает
   * пользователя; готовность приходит уведомлением. Дефолт "blocking" — текущее
   * блокирующее ожидание. Выставляется только при включённом kill-switch.
   */
  waitPolicy?: "blocking" | "background_notified";
  /** Честный диапазон ожидания для копирайта, секунды. */
  etaRangeSec?: { min: number; max: number };
  /** Человеческое название продукта для экранов и уведомлений. */
  productTitle?: string;
};

export function hashDedupeParts(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex").slice(0, 40);
}

const NATAL_INTERPRETATION: PaidJobKindConfig = {
  kind: "natal_interpretation",
  runeAction: "NATAL_READING",
  maxActivePerUser: 1,
  timeoutMs: 280_000,
  waitPolicy: "background_notified",
  etaRangeSec: { min: 60, max: 240 },
  productTitle: "Разбор натальной карты",
  workerPath: (job) => ({
    path: "/api/natal-chart/interpretation",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/natal-chart/interpretation",
  // forceRegenerate must bust dedupe: returning the in-flight non-regenerating
  // job would silently deliver the stale report the user explicitly refused.
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([
      userId,
      "natal_interpretation",
      payload.tradition,
      payload.engineVersion,
      payload.forceRegenerate === true,
    ]),
};

const NATAL_FORECAST: PaidJobKindConfig = {
  kind: "natal_forecast",
  runeAction: "FORECAST_REPORT",
  maxActivePerUser: 1,
  timeoutMs: 280_000,
  waitPolicy: "background_notified",
  etaRangeSec: { min: 60, max: 240 },
  productTitle: "Прогноз по натальной карте",
  workerPath: (job) => ({
    path: "/api/natal-chart/forecast",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/natal-chart/forecast",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([
      userId,
      "natal_forecast",
      payload.tradition,
      payload.horizon,
      payload.engineVersion,
      payload.forceRegenerate === true,
    ]),
};

const NATAL_COMPATIBILITY: PaidJobKindConfig = {
  kind: "natal_compatibility",
  runeAction: "SYNASTRY_REPORT",
  maxActivePerUser: 1,
  timeoutMs: 280_000,
  waitPolicy: "background_notified",
  etaRangeSec: { min: 60, max: 240 },
  productTitle: "Разбор совместимости",
  workerPath: (job) => {
    const id = job.input.id;
    if (typeof id !== "string") throw new Error("invalid compatibility job payload");
    const { id: _id, ...body } = job.input;
    return {
      path: `/api/natal-chart/compatibility/${encodeURIComponent(id)}/generate`,
      body: { ...body, async: false },
    };
  },
  matchesWorkerPath: (pathname) =>
    /^\/api\/natal-chart\/compatibility\/[^/]+\/generate$/.test(pathname),
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([userId, "natal_compatibility", payload.id]),
};

const READING: PaidJobKindConfig = {
  kind: "reading",
  runeAction: "READING",
  maxActivePerUser: 2,
  timeoutMs: 180_000,
  workerPath: (job) => ({
    path: "/api/reading",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/reading",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([
      userId,
      "reading",
      payload.characterId,
      payload.spreadId ?? payload.spreadType,
      payload.cardsKey ?? payload.tarotCardsKey,
      payload.numerologToolId,
    ]),
};

const INTENTION_SPREAD: PaidJobKindConfig = {
  kind: "intention_spread",
  runeAction: "INTENTION_SPREAD",
  maxActivePerUser: 2,
  // generateReading can run primary + repair + rescue; keep under worker REQUEST_TIMEOUT (~280s).
  timeoutMs: 240_000,
  workerPath: (job) => ({
    path: "/api/intention-spread",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/intention-spread",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([
      userId,
      "intention_spread",
      payload.spreadId,
      payload.intention,
      payload.cardsKey,
    ]),
};

const DAILY_READING: PaidJobKindConfig = {
  kind: "daily_reading",
  maxActivePerUser: 1,
  timeoutMs: 120_000,
  workerPath: (job) => ({
    path: "/api/daily-reading",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/daily-reading",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([userId, "daily_reading", payload.readingDate, payload.variant]),
};

const DAILY_EXTENDED: PaidJobKindConfig = {
  kind: "daily_extended",
  runeAction: "DAILY_EXTENDED",
  maxActivePerUser: 1,
  timeoutMs: 120_000,
  workerPath: (job) => ({
    path: "/api/daily-reading",
    body: { ...job.input, async: false, extended: true },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/daily-reading",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([userId, "daily_extended", payload.readingDate]),
};

const PHOTO_READING: PaidJobKindConfig = {
  kind: "photo_reading",
  runeAction: "VISION_ANALYSIS",
  maxActivePerUser: 2,
  timeoutMs: 180_000,
  workerPath: (job) => ({
    path: "/api/photo-reading/stream",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/photo-reading/stream",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([userId, "photo_reading", payload.photoSpreadKey ?? payload.idempotencyKey]),
};

const RITUAL_GENERATION: PaidJobKindConfig = {
  kind: "ritual_generation",
  maxActivePerUser: 2,
  timeoutMs: 180_000,
  workerPath: (job) => {
    const id = job.input.id;
    if (typeof id !== "string") throw new Error("invalid ritual job payload");
    return {
      path: `/api/ritual/${encodeURIComponent(id)}/regenerate`,
      body: { ...job.input, async: false },
    };
  },
  matchesWorkerPath: (pathname) => /^\/api\/ritual\/[^/]+\/regenerate$/.test(pathname),
  buildDedupeKey: (userId, payload) => hashDedupeParts([userId, "ritual_generation", payload.id]),
};

const JOINT_READING: PaidJobKindConfig = {
  kind: "joint_reading",
  runeAction: "JOINT_READING",
  maxActivePerUser: 2,
  timeoutMs: 180_000,
  workerPath: (job) => ({
    path: "/api/joint-reading/create",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/joint-reading/create",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([userId, "joint_reading", payload.idempotencyKey ?? payload.partnerKey]),
};

const JOINT_COMBINED: PaidJobKindConfig = {
  kind: "joint_combined",
  maxActivePerUser: 2,
  timeoutMs: 180_000,
  workerPath: (job) => {
    const token = job.input.token;
    if (typeof token !== "string" || !token.trim()) {
      throw new Error("invalid joint_combined job payload");
    }
    return {
      path: `/api/joint-reading/${encodeURIComponent(token.trim())}/combine`,
      body: { ...job.input, async: false },
    };
  },
  matchesWorkerPath: (pathname) => /^\/api\/joint-reading\/[^/]+\/combine$/.test(pathname),
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([userId, "joint_combined", payload.token]),
};

const NUMEROLOGY_READING: PaidJobKindConfig = {
  kind: "numerology_reading",
  runeAction: "NUMEROLOGY_SESSION",
  maxActivePerUser: 1,
  /** Full matrix ≈ 19 zone LLM calls; align with bot siteNumerology 420s. */
  timeoutMs: 420_000,
  waitPolicy: "background_notified",
  etaRangeSec: { min: 180, max: 480 },
  productTitle: "Разбор матрицы",
  workerPath: (job) => ({
    path: "/api/reading",
    body: { ...job.input, async: false, characterId: "numerolog" },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/reading",
  buildDedupeKey: (userId, payload) => {
    const birthRaw = typeof payload.birthDate === "string" ? payload.birthDate : "";
    // Prefer ISO YYYY-MM-DD so dotted/ISO client variants share one active job.
    const birthKey = /^\d{4}-\d{2}-\d{2}/.test(birthRaw.trim())
      ? birthRaw.trim().slice(0, 10)
      : birthRaw.trim();
    const partnerRaw =
      typeof payload.partnerDate === "string"
        ? payload.partnerDate
        : typeof (payload.numerologToolParams as { partnerDate?: string } | undefined)
              ?.partnerDate === "string"
          ? (payload.numerologToolParams as { partnerDate: string }).partnerDate
          : "";
    const partnerKey = /^\d{4}-\d{2}-\d{2}/.test(partnerRaw.trim())
      ? partnerRaw.trim().slice(0, 10)
      : partnerRaw.trim();
    return hashDedupeParts([
      userId,
      "numerology_reading",
      payload.numerologToolId,
      payload.numerologReadingCacheKey,
      birthKey,
      partnerKey,
      typeof payload.matrixSubjectId === "string" ? payload.matrixSubjectId.trim() : "",
    ]);
  },
};

const IMAGE_GENERATE: PaidJobKindConfig = {
  kind: "image_generate",
  maxActivePerUser: 2,
  timeoutMs: 180_000,
  workerPath: (job) => ({
    path: "/api/image/generate",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/image/generate",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([userId, "image_generate", payload.scene, payload.cardsKey, payload.spreadId]),
};

const HD_REPORT: PaidJobKindConfig = {
  kind: "hd_report",
  runeAction: "HD_REPORT",
  maxActivePerUser: 1,
  // Sectional generate: ~23 LLM calls (route maxDuration 800s).
  // Charge lives on the hd_reports row (not the job), so a worker HTTP
  // timeout fails the job cosmetically while the route completes — the
  // client polls the report entity, and stale-resume covers a true crash.
  timeoutMs: 800_000,
  waitPolicy: "background_notified",
  etaRangeSec: { min: 180, max: 600 },
  productTitle: "Разбор Дизайна Человека",
  workerPath: (job) => ({
    path: "/api/human-design/report",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/human-design/report",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([userId, "hd_report", payload.chartId]),
};

const HD_COMPOSITE_REPORT: PaidJobKindConfig = {
  kind: "hd_composite_report",
  runeAction: "HD_COMPOSITE_REPORT",
  maxActivePerUser: 1,
  // Same multi-pass budget as personal (route maxDuration 600s).
  timeoutMs: 600_000,
  waitPolicy: "background_notified",
  etaRangeSec: { min: 180, max: 540 },
  productTitle: "Разбор связи по Дизайну Человека",
  workerPath: (job) => ({
    path: "/api/human-design/composite-report",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/human-design/composite-report",
  // Canonical pair order (A+B ≡ B+A), mirroring normalizeCompositePair.
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([
      userId,
      "hd_composite_report",
      ...[String(payload.baseChartId ?? ""), String(payload.partnerChartId ?? "")].sort(),
    ]),
};

/** Pro practice premium report — billed via Pro module, not consumer runeAction. */
const PRO_PREMIUM_REPORT: PaidJobKindConfig = {
  kind: "pro_premium_report",
  maxActivePerUser: 1,
  /** Sectional HD: 12 batches + editor + quality retries — match hd_report. */
  timeoutMs: 800_000,
  waitPolicy: "background_notified",
  etaRangeSec: { min: 120, max: 720 },
  productTitle: "Премиум-отчёт",
  workerPath: (job) => ({
    path: "/api/pro/jobs/premium-report",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/pro/jobs/premium-report",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([userId, "pro_premium_report", payload.caseId, payload.idempotencyKey]),
};

const AURA_READING: PaidJobKindConfig = {
  kind: "aura_reading",
  runeAction: "AURA_READING",
  maxActivePerUser: 1,
  timeoutMs: 240_000,
  waitPolicy: "background_notified",
  etaRangeSec: { min: 40, max: 180 },
  productTitle: "Разбор ауры по фото",
  workerPath: (job) => ({
    path: "/api/aura/report",
    body: { ...job.input, async: false },
  }),
  matchesWorkerPath: (pathname) => pathname === "/api/aura/report",
  buildDedupeKey: (userId, payload) =>
    hashDedupeParts([userId, "aura_reading", payload.auraSnapshotId ?? payload.idempotencyKey]),
};

export const ASYNC_JOB_REGISTRY: Record<AsyncJobKind, PaidJobKindConfig> = {
  natal_interpretation: NATAL_INTERPRETATION,
  natal_forecast: NATAL_FORECAST,
  natal_compatibility: NATAL_COMPATIBILITY,
  reading: READING,
  intention_spread: INTENTION_SPREAD,
  daily_reading: DAILY_READING,
  daily_extended: DAILY_EXTENDED,
  photo_reading: PHOTO_READING,
  ritual_generation: RITUAL_GENERATION,
  joint_reading: JOINT_READING,
  joint_combined: JOINT_COMBINED,
  numerology_reading: NUMEROLOGY_READING,
  image_generate: IMAGE_GENERATE,
  hd_report: HD_REPORT,
  hd_composite_report: HD_COMPOSITE_REPORT,
  pro_premium_report: PRO_PREMIUM_REPORT,
  aura_reading: AURA_READING,
};

/** Kinds the durable worker processes by default (others via ASYNC_JOB_KINDS). */
export const DEFAULT_WORKER_KINDS: AsyncJobKind[] = [
  "natal_interpretation",
  "natal_forecast",
  "natal_compatibility",
  "reading",
  "numerology_reading",
  "intention_spread",
  "daily_reading",
  "daily_extended",
  "image_generate",
  "photo_reading",
  "ritual_generation",
  "joint_reading",
  "joint_combined",
  "hd_report",
  "hd_composite_report",
  "pro_premium_report",
  "aura_reading",
];

export function getJobKindConfig(kind: AsyncJobKind): PaidJobKindConfig {
  const config = ASYNC_JOB_REGISTRY[kind];
  if (!config) throw new Error(`unsupported async job kind: ${kind}`);
  return config;
}

export function endpointForJob(job: AsyncJobRow): { path: string; body: Record<string, unknown> } {
  return getJobKindConfig(job.kind).workerPath(job);
}

export function isAsyncJobWorkerEndpoint(pathname: string): boolean {
  return Object.values(ASYNC_JOB_REGISTRY).some((config) => config.matchesWorkerPath(pathname));
}

export function resolveWorkerKindsFromEnv(): AsyncJobKind[] {
  const raw = process.env.ASYNC_JOB_KINDS?.trim();
  if (!raw) return [...DEFAULT_WORKER_KINDS];
  const allowed = new Set(Object.keys(ASYNC_JOB_REGISTRY) as AsyncJobKind[]);
  const kinds = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is AsyncJobKind => allowed.has(value as AsyncJobKind));
  return kinds.length ? kinds : [...DEFAULT_WORKER_KINDS];
}
