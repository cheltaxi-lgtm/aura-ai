/**
 * Thematic Wordstat via Yandex Direct API v4 (CreateNewWordstatReport).
 * Deduped phrases, append-only run history, diffs vs previous successful run.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { adsQuery } from "../db";
import { getBudget } from "../config";

const DELTA_PCT_MIN = 0.15;
const DELTA_ABS_MIN = 50;
const MOVER_TOP = 15;
const RETENTION_DAYS = 90;
const CRON_MIN_HOURS = 20;
const HISTORY_RUNS = 30;

export type WordstatPhrase = {
  phrase: string;
  phraseNorm: string;
  shows: number;
  seeds: string[];
  /** @deprecated use seeds[0] — kept for KeywordSource compat */
  seed: string;
  bucket: "with" | "also";
  inTheme: boolean;
  inDiscoveryBand: boolean;
};

export type WordstatMover = {
  phrase: string;
  phraseNorm: string;
  status: "new" | "risen" | "fallen" | "lost";
  prevShows: number | null;
  shows: number | null;
  delta: number | null;
  deltaPct: number | null;
};

export type WordstatRunSummary = {
  id: string;
  fetchedAt: string;
  ok: boolean;
  error?: string | null;
  region: number;
  seeds: string[];
  phraseCount: number;
  inThemeCount: number;
  inBandCount: number;
  newCount: number;
  risenCount: number;
  fallenCount: number;
  lostCount: number;
  medianShowsTheme: number | null;
  maxShows: number;
  discovery: { freqMin: number; freqMax: number };
  reportId: number | null;
};

export type WordstatHistoryPoint = {
  fetchedAt: string;
  inThemeCount: number;
  inBandCount: number;
  phraseCount: number;
};

export type WordstatSeedCluster = {
  id: string;
  seeds: string[];
  phraseCount: number;
  inBandCount: number;
};

export type WordstatDashboard = {
  latest: WordstatRunSummary | null;
  previousAt: string | null;
  phrases: WordstatPhrase[];
  movers: WordstatMover[];
  history: WordstatHistoryPoint[];
  clusters: WordstatSeedCluster[];
  staleHours: number | null;
};

/** Legacy shape kept for source_snapshot pointer / KeywordSource. */
export type WordstatSnapshot = {
  runId: string | null;
  regionIds: number[];
  seeds: string[];
  fetchedAt: string;
  reportId: number | null;
  phrases: WordstatPhrase[];
  totals: {
    phraseCount: number;
    inThemeCount: number;
    inBandCount: number;
    maxShows: number;
    medianShowsTheme: number | null;
  };
  discovery: { freqMin: number; freqMax: number };
  error?: string | null;
};

type SeedsConfig = {
  region_ids?: number[];
  seeds?: string[];
  theme_stems?: string[];
  clusters?: Record<string, string[]>;
};

const DEFAULT_SEEDS = [
  "гадание таро онлайн",
  "расклад таро",
  "расшифровка таро по фото",
  "руны онлайн",
  "значение рун",
  "матрица судьбы",
  "нумерология онлайн",
  "гадание на отношения",
  "ленорман",
];

const DEFAULT_STEMS = [
  "таро",
  "рун",
  "гадан",
  "расклад",
  "ленорман",
  "матриц",
  "нумеролог",
  "гороскоп",
  "астролог",
  "аркан",
  "судьб",
  "прогноз",
  "эзотерик",
  "оракул",
  "расшифр",
];

const DEFAULT_CLUSTERS: Record<string, string[]> = {
  taro: ["гадание таро онлайн", "расклад таро", "расшифровка таро по фото"],
  runes: ["руны онлайн", "значение рун"],
  matrix: ["матрица судьбы"],
  numerology: ["нумерология онлайн"],
  relations: ["гадание на отношения"],
  lenormand: ["ленорман"],
};

function loadSeedsConfig(): SeedsConfig {
  try {
    const path = join(process.cwd(), "config/ads/wordstat-seeds.yaml");
    if (!existsSync(path)) return {};
    const yaml = require("yaml") as { parse: (s: string) => SeedsConfig };
    return yaml.parse(readFileSync(path, "utf8")) || {};
  } catch {
    return {};
  }
}

export function normalizePhrase(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function wordstatToken(): string | null {
  return (
    process.env.WORDSTAT_TOKEN ||
    process.env.ADS_DIRECT_TOKEN ||
    process.env.YANDEX_METRIKA_OAUTH_TOKEN ||
    null
  );
}

async function directV4<T = unknown>(
  method: string,
  param?: unknown
): Promise<T> {
  const token = wordstatToken();
  if (!token) throw new Error("WORDSTAT_TOKEN / ADS_DIRECT_TOKEN missing");
  const res = await fetch("https://api.direct.yandex.ru/live/v4/json/", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      method,
      token,
      ...(param !== undefined ? { param } : {}),
    }),
  });
  const json = (await res.json()) as {
    data?: T;
    error_code?: number;
    error_str?: string;
  };
  if (json.error_code || json.error_str) {
    throw new Error(json.error_str || `Direct v4 error ${json.error_code}`);
  }
  return json.data as T;
}

function isInTheme(phrase: string, stems: string[]): boolean {
  const p = phrase.toLowerCase();
  return stems.some((s) => p.includes(s.toLowerCase()));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

type ReportBlock = {
  Phrase?: string;
  SearchedWith?: { Phrase?: string; Shows?: number }[];
  SearchedAlso?: { Phrase?: string; Shows?: number }[];
};

type MergedRow = {
  phrase: string;
  phraseNorm: string;
  shows: number;
  seeds: Set<string>;
  bucket: "with" | "also";
  inTheme: boolean;
};

function mergeBlocks(
  blocks: ReportBlock[],
  fallbackSeeds: string[],
  stems: string[]
): MergedRow[] {
  const byNorm = new Map<string, MergedRow>();
  for (const block of blocks) {
    const seed = (block.Phrase || fallbackSeeds[0] || "").trim();
    const push = (
      rows: { Phrase?: string; Shows?: number }[] | undefined,
      bucket: "with" | "also"
    ) => {
      for (const r of rows || []) {
        const phrase = (r.Phrase || "").trim();
        const shows = Number(r.Shows || 0);
        if (!phrase || !Number.isFinite(shows) || shows <= 0) continue;
        const phraseNorm = normalizePhrase(phrase);
        const inTheme = isInTheme(phrase, stems);
        if (bucket === "also" && !inTheme) continue;
        const prev = byNorm.get(phraseNorm);
        if (!prev) {
          byNorm.set(phraseNorm, {
            phrase,
            phraseNorm,
            shows,
            seeds: new Set(seed ? [seed] : []),
            bucket,
            inTheme,
          });
          continue;
        }
        if (shows > prev.shows) {
          prev.shows = shows;
          prev.phrase = phrase;
        }
        if (seed) prev.seeds.add(seed);
        if (bucket === "with") prev.bucket = "with";
        prev.inTheme = prev.inTheme || inTheme;
      }
    };
    push(block.SearchedWith, "with");
    push(block.SearchedAlso, "also");
  }
  return [...byNorm.values()].sort((a, b) => b.shows - a.shows);
}

function toPhrase(
  row: MergedRow,
  freqMin: number,
  freqMax: number
): WordstatPhrase {
  const seeds = [...row.seeds];
  return {
    phrase: row.phrase,
    phraseNorm: row.phraseNorm,
    shows: row.shows,
    seeds,
    seed: seeds[0] || "",
    bucket: row.bucket,
    inTheme: row.inTheme,
    inDiscoveryBand: row.shows >= freqMin && row.shows <= freqMax,
  };
}

export function computeDiff(
  current: WordstatPhrase[],
  previous: Map<string, number>
): { movers: WordstatMover[]; counts: {
  newCount: number;
  risenCount: number;
  fallenCount: number;
  lostCount: number;
} } {
  const emptyCounts = {
    newCount: 0,
    risenCount: 0,
    fallenCount: 0,
    lostCount: 0,
  };
  // First successful run has nothing to compare against.
  if (previous.size === 0) {
    return { movers: [], counts: emptyCounts };
  }

  const curMap = new Map(current.map((p) => [p.phraseNorm, p]));
  const movers: WordstatMover[] = [];
  let newCount = 0;
  let risenCount = 0;
  let fallenCount = 0;
  let lostCount = 0;

  for (const p of current) {
    const prev = previous.get(p.phraseNorm);
    if (prev == null) {
      newCount++;
      movers.push({
        phrase: p.phrase,
        phraseNorm: p.phraseNorm,
        status: "new",
        prevShows: null,
        shows: p.shows,
        delta: p.shows,
        deltaPct: null,
      });
      continue;
    }
    const delta = p.shows - prev;
    const deltaPct = prev > 0 ? delta / prev : null;
    const significant =
      Math.abs(delta) >= DELTA_ABS_MIN &&
      deltaPct != null &&
      Math.abs(deltaPct) >= DELTA_PCT_MIN;
    if (!significant) continue;
    if (delta > 0) {
      risenCount++;
      movers.push({
        phrase: p.phrase,
        phraseNorm: p.phraseNorm,
        status: "risen",
        prevShows: prev,
        shows: p.shows,
        delta,
        deltaPct,
      });
    } else {
      fallenCount++;
      movers.push({
        phrase: p.phrase,
        phraseNorm: p.phraseNorm,
        status: "fallen",
        prevShows: prev,
        shows: p.shows,
        delta,
        deltaPct,
      });
    }
  }

  for (const [norm, prevShows] of previous) {
    if (curMap.has(norm)) continue;
    lostCount++;
    movers.push({
      phrase: norm,
      phraseNorm: norm,
      status: "lost",
      prevShows,
      shows: null,
      delta: -prevShows,
      deltaPct: -1,
    });
  }

  const rank = (m: WordstatMover) => Math.abs(m.delta ?? m.shows ?? 0);
  const pick = (status: WordstatMover["status"]) =>
    movers
      .filter((m) => m.status === status)
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, MOVER_TOP);

  return {
    movers: [
      ...pick("new"),
      ...pick("risen"),
      ...pick("fallen"),
      ...pick("lost"),
    ],
    counts: { newCount, risenCount, fallenCount, lostCount },
  };
}

export async function fetchWordstatSnapshot(opts?: {
  seeds?: string[];
  regionIds?: number[];
  maxWaitMs?: number;
}): Promise<WordstatSnapshot> {
  const cfg = loadSeedsConfig();
  const seeds = (opts?.seeds || cfg.seeds || DEFAULT_SEEDS).slice(0, 10);
  const regionIds = opts?.regionIds || cfg.region_ids || [225];
  const stems = cfg.theme_stems || DEFAULT_STEMS;
  const budget = await getBudget();
  const freqMin = budget.discovery_freq_min || 100;
  const freqMax = budget.discovery_freq_max || 5000;
  const maxWaitMs = opts?.maxWaitMs ?? 90_000;

  if (!wordstatToken()) {
    throw new Error("WORDSTAT_TOKEN / ADS_DIRECT_TOKEN missing");
  }
  if (!seeds.length) {
    throw new Error("No Wordstat seeds configured");
  }

  const reportId = await directV4<number>("CreateNewWordstatReport", {
    Phrases: seeds,
    GeoID: regionIds,
  });

  const started = Date.now();
  let done = false;
  while (Date.now() - started < maxWaitMs) {
    await sleep(2500);
    const list =
      (await directV4<{ ReportID: number; StatusReport: string }[]>(
        "GetWordstatReportList"
      )) || [];
    const mine = list.find((r) => r.ReportID === reportId);
    if (mine?.StatusReport === "Done") {
      done = true;
      break;
    }
    if (mine?.StatusReport === "Failed") {
      throw new Error(`Wordstat report ${reportId} failed`);
    }
  }
  if (!done) {
    try {
      await directV4("DeleteWordstatReport", reportId);
    } catch {
      /* ignore */
    }
    throw new Error(`Wordstat report ${reportId} timeout`);
  }

  const blocks = (await directV4<ReportBlock[]>("GetWordstatReport", reportId)) || [];
  try {
    await directV4("DeleteWordstatReport", reportId);
  } catch {
    /* ignore */
  }

  const merged = mergeBlocks(blocks, seeds, stems);
  const phrases = merged.map((r) => toPhrase(r, freqMin, freqMax));
  const inTheme = phrases.filter((p) => p.inTheme);
  const inBand = phrases.filter((p) => p.inTheme && p.inDiscoveryBand);

  return {
    runId: null,
    regionIds,
    seeds,
    fetchedAt: new Date().toISOString(),
    reportId,
    phrases,
    totals: {
      phraseCount: phrases.length,
      inThemeCount: inTheme.length,
      inBandCount: inBand.length,
      maxShows: phrases[0]?.shows || 0,
      medianShowsTheme: median(inTheme.map((p) => p.shows)),
    },
    discovery: { freqMin, freqMax },
    error: null,
  };
}

async function loadPreviousThemeShows(): Promise<{
  runId: string | null;
  fetchedAt: string | null;
  shows: Map<string, number>;
}> {
  try {
    const { rows } = await adsQuery<{ id: string; fetched_at: Date }>(
      `SELECT id, fetched_at FROM ads.wordstat_run
       WHERE ok = TRUE
       ORDER BY fetched_at DESC
       LIMIT 1`
    );
    const prev = rows[0];
    if (!prev) return { runId: null, fetchedAt: null, shows: new Map() };
    const { rows: pts } = await adsQuery<{ phrase_norm: string; shows: number }>(
      `SELECT phrase_norm, shows FROM ads.wordstat_phrase_point
       WHERE run_id = $1 AND in_theme = TRUE`,
      [prev.id]
    );
    return {
      runId: prev.id,
      fetchedAt: new Date(prev.fetched_at).toISOString(),
      shows: new Map(pts.map((p) => [p.phrase_norm, p.shows])),
    };
  } catch {
    return { runId: null, fetchedAt: null, shows: new Map() };
  }
}

async function pruneOldRuns(): Promise<void> {
  try {
    await adsQuery(
      `DELETE FROM ads.wordstat_run
       WHERE fetched_at < NOW() - ($1::text || ' days')::interval`,
      [String(RETENTION_DAYS)]
    );
  } catch {
    /* ignore */
  }
}

export async function persistWordstatSnapshot(
  snapshot: WordstatSnapshot
): Promise<{ runId: string; movers: WordstatMover[]; previousAt: string | null }> {
  const region = snapshot.regionIds[0] ?? 225;
  const prev = await loadPreviousThemeShows();
  const themePhrases = snapshot.phrases.filter((p) => p.inTheme);
  const { movers, counts } = computeDiff(themePhrases, prev.shows);
  const runId = randomUUID();

  await adsQuery(
    `INSERT INTO ads.wordstat_run (
       id, fetched_at, ok, error, region, seeds,
       phrase_count, in_theme_count, in_band_count,
       new_count, risen_count, fallen_count, lost_count,
       median_shows_theme, max_shows, diff_json, meta_json
     ) VALUES (
       $1, NOW(), TRUE, NULL, $2, $3::text[],
       $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12, $13::jsonb, $14::jsonb
     )`,
    [
      runId,
      region,
      snapshot.seeds,
      snapshot.totals.phraseCount,
      snapshot.totals.inThemeCount,
      snapshot.totals.inBandCount,
      counts.newCount,
      counts.risenCount,
      counts.fallenCount,
      counts.lostCount,
      snapshot.totals.medianShowsTheme,
      snapshot.totals.maxShows,
      JSON.stringify({ movers, previousRunId: prev.runId, previousAt: prev.fetchedAt }),
      JSON.stringify({
        reportId: snapshot.reportId,
        freqMin: snapshot.discovery.freqMin,
        freqMax: snapshot.discovery.freqMax,
      }),
    ]
  );

  // Persist in-theme phrases (cap to keep rows sane; also keep high-freq out-of-band heads).
  const toStore = snapshot.phrases
    .filter((p) => p.inTheme || p.shows >= snapshot.discovery.freqMax)
    .slice(0, 800);

  const chunkSize = 80;
  for (let i = 0; i < toStore.length; i += chunkSize) {
    const chunk = toStore.slice(i, i + chunkSize);
    const values: unknown[] = [];
    const placeholders = chunk.map((p, idx) => {
      const o = idx * 8;
      values.push(
        runId,
        p.phraseNorm,
        p.phrase.slice(0, 500),
        p.shows,
        p.seeds,
        p.bucket,
        p.inTheme,
        p.inDiscoveryBand
      );
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}::text[], $${o + 6}, $${o + 7}, $${o + 8})`;
    });
    await adsQuery(
      `INSERT INTO ads.wordstat_phrase_point
         (run_id, phrase_norm, phrase, shows, seeds, bucket, in_theme, in_band)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (run_id, phrase_norm) DO NOTHING`,
      values
    );
  }

  // Keep keyword_stat current for discovery pipeline (deduped theme only).
  const kwChunk = themePhrases.slice(0, 200);
  for (let i = 0; i < kwChunk.length; i += 40) {
    const chunk = kwChunk.slice(i, i + 40);
    for (const p of chunk) {
      await adsQuery(
        `INSERT INTO ads.keyword_stat (phrase, region, freq_exact, freq_phrase, seasonality_json, fetched_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
         ON CONFLICT (phrase, region) DO UPDATE SET
           freq_exact = EXCLUDED.freq_exact,
           freq_phrase = EXCLUDED.freq_phrase,
           seasonality_json = EXCLUDED.seasonality_json,
           fetched_at = NOW()`,
        [
          p.phrase.slice(0, 500),
          region,
          p.bucket === "with" ? p.shows : null,
          p.shows,
          JSON.stringify({
            seeds: p.seeds,
            bucket: p.bucket,
            inTheme: p.inTheme,
            inDiscoveryBand: p.inDiscoveryBand,
            source: "direct_v4_wordstat",
            runId,
          }),
        ]
      );
    }
  }

  const summaryPayload = {
    runId,
    regionIds: snapshot.regionIds,
    seeds: snapshot.seeds,
    fetchedAt: snapshot.fetchedAt,
    reportId: snapshot.reportId,
    totals: snapshot.totals,
    discovery: snapshot.discovery,
    moversSummary: counts,
    previousAt: prev.fetchedAt,
  };

  await adsQuery(
    `INSERT INTO ads.source_snapshot (source, fetched_at, ok, error, payload_json)
     VALUES ('wordstat', NOW(), TRUE, NULL, $1::jsonb)
     ON CONFLICT (source) DO UPDATE SET
       fetched_at = NOW(),
       ok = TRUE,
       error = NULL,
       payload_json = EXCLUDED.payload_json`,
    [JSON.stringify(summaryPayload)]
  );

  await pruneOldRuns();
  return { runId, movers, previousAt: prev.fetchedAt };
}

async function persistFailedRun(error: string, seeds: string[]): Promise<void> {
  try {
    await adsQuery(
      `INSERT INTO ads.wordstat_run (
         fetched_at, ok, error, region, seeds, meta_json
       ) VALUES (NOW(), FALSE, $1, 225, $2::text[], '{}'::jsonb)`,
      [error, seeds]
    );
    await adsQuery(
      `INSERT INTO ads.source_snapshot (source, fetched_at, ok, error, payload_json)
       VALUES ('wordstat', NOW(), FALSE, $1, '{}'::jsonb)
       ON CONFLICT (source) DO UPDATE SET
         fetched_at = NOW(), ok = FALSE, error = EXCLUDED.error`,
      [error]
    );
  } catch {
    /* ignore */
  }
}

function buildClusters(
  phrases: WordstatPhrase[],
  cfgClusters: Record<string, string[]>
): WordstatSeedCluster[] {
  const clusters = Object.keys(cfgClusters).length
    ? cfgClusters
    : DEFAULT_CLUSTERS;
  return Object.entries(clusters).map(([id, seeds]) => {
    const seedSet = new Set(seeds.map(normalizePhrase));
    const matched = phrases.filter(
      (p) =>
        p.inTheme &&
        p.seeds.some((s) => seedSet.has(normalizePhrase(s)))
    );
    return {
      id,
      seeds,
      phraseCount: matched.length,
      inBandCount: matched.filter((p) => p.inDiscoveryBand).length,
    };
  });
}

export async function loadWordstatDashboard(): Promise<WordstatDashboard> {
  const empty: WordstatDashboard = {
    latest: null,
    previousAt: null,
    phrases: [],
    movers: [],
    history: [],
    clusters: [],
    staleHours: null,
  };

  try {
    const { rows: runRows } = await adsQuery<{
      id: string;
      fetched_at: Date;
      ok: boolean;
      error: string | null;
      region: number;
      seeds: string[];
      phrase_count: number;
      in_theme_count: number;
      in_band_count: number;
      new_count: number;
      risen_count: number;
      fallen_count: number;
      lost_count: number;
      median_shows_theme: number | null;
      max_shows: number;
      diff_json: { movers?: WordstatMover[]; previousAt?: string | null };
      meta_json: {
        reportId?: number | null;
        freqMin?: number;
        freqMax?: number;
      };
    }>(
      `SELECT * FROM ads.wordstat_run WHERE ok = TRUE
       ORDER BY fetched_at DESC LIMIT 1`
    );
    const run = runRows[0];
    if (!run) return empty;

    const { rows: pts } = await adsQuery<{
      phrase: string;
      phrase_norm: string;
      shows: number;
      seeds: string[];
      bucket: "with" | "also";
      in_theme: boolean;
      in_band: boolean;
    }>(
      `SELECT phrase, phrase_norm, shows, seeds, bucket, in_theme, in_band
       FROM ads.wordstat_phrase_point
       WHERE run_id = $1
       ORDER BY shows DESC`,
      [run.id]
    );

    const phrases: WordstatPhrase[] = pts.map((p) => ({
      phrase: p.phrase,
      phraseNorm: p.phrase_norm,
      shows: p.shows,
      seeds: p.seeds || [],
      seed: (p.seeds && p.seeds[0]) || "",
      bucket: p.bucket,
      inTheme: p.in_theme,
      inDiscoveryBand: p.in_band,
    }));

    const { rows: hist } = await adsQuery<{
      fetched_at: Date;
      in_theme_count: number;
      in_band_count: number;
      phrase_count: number;
    }>(
      `SELECT fetched_at, in_theme_count, in_band_count, phrase_count
       FROM ads.wordstat_run
       WHERE ok = TRUE
       ORDER BY fetched_at DESC
       LIMIT $1`,
      [HISTORY_RUNS]
    );

    const meta = run.meta_json || {};
    const diff = run.diff_json || {};
    const fetchedAt = new Date(run.fetched_at).toISOString();

    return {
      latest: {
        id: run.id,
        fetchedAt,
        ok: run.ok,
        error: run.error,
        region: run.region,
        seeds: run.seeds || [],
        phraseCount: run.phrase_count,
        inThemeCount: run.in_theme_count,
        inBandCount: run.in_band_count,
        newCount: run.new_count,
        risenCount: run.risen_count,
        fallenCount: run.fallen_count,
        lostCount: run.lost_count,
        medianShowsTheme: run.median_shows_theme,
        maxShows: run.max_shows,
        discovery: {
          freqMin: meta.freqMin ?? 100,
          freqMax: meta.freqMax ?? 5000,
        },
        reportId: meta.reportId ?? null,
      },
      previousAt: diff.previousAt ?? null,
      phrases,
      movers: diff.movers || [],
      history: hist
        .slice()
        .reverse()
        .map((h) => ({
          fetchedAt: new Date(h.fetched_at).toISOString(),
          inThemeCount: h.in_theme_count,
          inBandCount: h.in_band_count,
          phraseCount: h.phrase_count,
        })),
      clusters: buildClusters(phrases, loadSeedsConfig().clusters || {}),
      staleHours: (Date.now() - new Date(run.fetched_at).getTime()) / 3600000,
    };
  } catch {
    return empty;
  }
}

/** Prefer loadWordstatDashboard — thin adapter for KeywordSource. */
export async function loadWordstatSnapshot(): Promise<WordstatSnapshot | null> {
  const dash = await loadWordstatDashboard();
  if (!dash.latest) return null;
  return {
    runId: dash.latest.id,
    regionIds: [dash.latest.region],
    seeds: dash.latest.seeds,
    fetchedAt: dash.latest.fetchedAt,
    reportId: dash.latest.reportId,
    phrases: dash.phrases,
    totals: {
      phraseCount: dash.latest.phraseCount,
      inThemeCount: dash.latest.inThemeCount,
      inBandCount: dash.latest.inBandCount,
      maxShows: dash.latest.maxShows,
      medianShowsTheme: dash.latest.medianShowsTheme,
    },
    discovery: dash.latest.discovery,
    error: dash.latest.error,
  };
}

export async function hoursSinceLastOkRun(): Promise<number | null> {
  try {
    const { rows } = await adsQuery<{ fetched_at: Date }>(
      `SELECT fetched_at FROM ads.wordstat_run WHERE ok = TRUE
       ORDER BY fetched_at DESC LIMIT 1`
    );
    if (!rows[0]) return null;
    return (Date.now() - new Date(rows[0].fetched_at).getTime()) / 3600000;
  } catch {
    return null;
  }
}

export async function syncWordstatSource(opts?: {
  force?: boolean;
}): Promise<{
  ok: boolean;
  error?: string;
  phraseCount?: number;
  skipped?: boolean;
  runId?: string;
}> {
  if (!opts?.force) {
    const hours = await hoursSinceLastOkRun();
    if (hours != null && hours < CRON_MIN_HOURS) {
      return { ok: true, skipped: true, phraseCount: 0 };
    }
  }

  const cfg = loadSeedsConfig();
  const seeds = (cfg.seeds || DEFAULT_SEEDS).slice(0, 10);

  try {
    const snap = await fetchWordstatSnapshot({ seeds });
    const { runId } = await persistWordstatSnapshot(snap);
    return { ok: true, phraseCount: snap.phrases.length, runId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await persistFailedRun(error, seeds);
    return { ok: false, error };
  }
}
