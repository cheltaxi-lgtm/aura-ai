/**
 * Semantics pipeline: collect → normalize → dedupe → filter → cluster → persist.
 */
import { adsQuery } from "../db";
import { getBudget } from "../config";
import {
  findStopWords,
  getCompetitorBrandTerms,
  getWhitelistPaths,
  isLandingWhitelisted,
  normalizeForMatch,
} from "../validator";
import { normalizePhrase } from "./normalize";
import { defaultSources, type KeywordSource, type RawKeyword } from "./sources";

export type ClusteredKeyword = {
  phrase: string;
  normalized: string;
  source: string;
  clusterKey: string;
  landingPath: string;
  freqExact: number | null;
  freqPhrase: number | null;
  status: "pending" | "rejected";
  rejectReason?: string;
};

const SLUG_LANDING: { slug: RegExp; landing: string; cluster: string }[] = [
  { slug: /матриц[аы].*судьб|судьб.*матриц|цифров.*матриц/i, landing: "/numerology/destiny-matrix", cluster: "matrix-destiny" },
  { slug: /рун[аые]?|старш.*рун/i, landing: "/runy", cluster: "runy" },
  { slug: /нумеролог|число судьб|квадрат пифагор/i, landing: "/numerology", cluster: "numerology" },
  { slug: /таро|аркан/i, landing: "/taro", cluster: "taro" },
  { slug: /прогноз|гороскоп/i, landing: "/prognoz", cluster: "prognoz" },
  { slug: /стать|расшифровк/i, landing: "/statyi", cluster: "statyi" },
];

function clusterFor(phrase: string): { clusterKey: string; landingPath: string } | null {
  const n = normalizeForMatch(phrase);
  for (const row of SLUG_LANDING) {
    if (row.slug.test(n)) {
      if (!isLandingWhitelisted(row.landing)) continue;
      return { clusterKey: row.cluster, landingPath: row.landing };
    }
  }
  // Fallback: first whitelist path that appears as substring of phrase path-like tokens
  const paths = getWhitelistPaths();
  for (const p of paths) {
    const slug = p.replace(/^\//, "").replace(/\//g, " ");
    if (slug && n.includes(normalizeForMatch(slug.replace(/-/g, " ")))) {
      return { clusterKey: p.replace(/^\//, "").split("/")[0] || "misc", landingPath: p };
    }
  }
  return null;
}

function hasBrandTerm(phrase: string): boolean {
  const n = normalizeForMatch(phrase);
  return getCompetitorBrandTerms().some((b) => n.includes(normalizeForMatch(b)));
}

export async function collectRaw(
  sources?: KeywordSource[],
  errors?: string[]
): Promise<RawKeyword[]> {
  const list = sources || defaultSources();
  const out: RawKeyword[] = [];
  for (const s of list) {
    try {
      const rows = await s.collect();
      out.push(...rows);
    } catch (e) {
      errors?.push(`${s.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

export function processKeywords(
  raw: RawKeyword[],
  opts?: { freqMin?: number; freqMax?: number }
): ClusteredKeyword[] {
  const freqMin = opts?.freqMin ?? 100;
  const freqMax = opts?.freqMax ?? 5000;
  const seen = new Set<string>();
  const result: ClusteredKeyword[] = [];

  for (const row of raw) {
    const normalized = normalizePhrase(row.phrase);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    if (findStopWords(normalized).length || hasBrandTerm(normalized)) {
      result.push({
        phrase: row.phrase,
        normalized,
        source: row.source,
        clusterKey: "",
        landingPath: "",
        freqExact: row.freqExact ?? null,
        freqPhrase: row.freqPhrase ?? null,
        status: "rejected",
        rejectReason: "stop_or_brand",
      });
      continue;
    }

    const cluster = clusterFor(normalized);
    if (!cluster) {
      result.push({
        phrase: row.phrase,
        normalized,
        source: row.source,
        clusterKey: "",
        landingPath: "",
        freqExact: row.freqExact ?? null,
        freqPhrase: row.freqPhrase ?? null,
        status: "rejected",
        rejectReason: "no_landing",
      });
      continue;
    }

    const freq = row.freqExact ?? row.freqPhrase ?? null;
    if (freq != null && (freq < freqMin || freq > freqMax)) {
      result.push({
        phrase: row.phrase,
        normalized,
        source: row.source,
        clusterKey: cluster.clusterKey,
        landingPath: cluster.landingPath,
        freqExact: row.freqExact ?? null,
        freqPhrase: row.freqPhrase ?? null,
        status: "rejected",
        rejectReason: "freq_out_of_range",
      });
      continue;
    }

    // Missing freq: keep as pending (Wordstat may enrich later); discovery push still validates.
    result.push({
      phrase: row.phrase.trim(),
      normalized,
      source: row.source,
      clusterKey: cluster.clusterKey,
      landingPath: cluster.landingPath,
      freqExact: row.freqExact ?? null,
      freqPhrase: row.freqPhrase ?? null,
      status: "pending",
    });
  }
  return result;
}

export async function persistCandidates(rows: ClusteredKeyword[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const exists = await adsQuery<{ id: string }>(
      `SELECT id FROM ads.keyword_candidate WHERE normalized = $1 LIMIT 1`,
      [r.normalized]
    );
    if (exists.rows[0]) continue;
    await adsQuery(
      `INSERT INTO ads.keyword_candidate
         (phrase, normalized, source, cluster_key, landing_path, freq_exact, freq_phrase, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        r.phrase,
        r.normalized,
        r.source,
        r.clusterKey || null,
        r.landingPath || null,
        r.freqExact,
        r.freqPhrase,
        r.status,
      ]
    );
    n++;
  }
  return n;
}

/** Full weekly semantics run. */
export async function runSemantics(opts?: {
  sources?: KeywordSource[];
  dryRun?: boolean;
}): Promise<{
  collected: number;
  pending: number;
  rejected: number;
  inserted: number;
  sourceErrors: string[];
}> {
  const budget = await getBudget();
  const sourceErrors: string[] = [];
  const raw = await collectRaw(opts?.sources, sourceErrors);
  const processed = processKeywords(raw, {
    freqMin: budget.discovery_freq_min,
    freqMax: budget.discovery_freq_max,
  });
  const pending = processed.filter((p) => p.status === "pending").length;
  const rejected = processed.filter((p) => p.status === "rejected").length;
  let inserted = 0;
  if (!opts?.dryRun) {
    // Prefer upsert by normalized when no unique constraint: delete-skip duplicates manually
    for (const r of processed) {
      const exists = await adsQuery<{ id: string }>(
        `SELECT id FROM ads.keyword_candidate WHERE normalized = $1 LIMIT 1`,
        [r.normalized]
      );
      if (exists.rows[0]) continue;
      await adsQuery(
        `INSERT INTO ads.keyword_candidate
           (phrase, normalized, source, cluster_key, landing_path, freq_exact, freq_phrase, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          r.phrase,
          r.normalized,
          r.source,
          r.clusterKey || null,
          r.landingPath || null,
          r.freqExact,
          r.freqPhrase,
          r.status,
        ]
      );
      inserted++;
    }
  }
  return { collected: raw.length, pending, rejected, inserted, sourceErrors };
}
