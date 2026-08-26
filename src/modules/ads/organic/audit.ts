/**
 * SEO audit of EXISTING landings only. No thin pages, no PF cheating, no bots/proxies.
 */
import { getAppUrl } from "@/lib/brand";
import { getWhitelistPaths } from "../validator";
import { adsQuery } from "../db";

export type LandingAudit = {
  path: string;
  ok: boolean;
  status: number | null;
  title: string | null;
  description: string | null;
  h1: string | null;
  h1Count: number;
  canonical: string | null;
  robots: string | null;
  noindex: boolean;
  schemaTypes: string[];
  inSitemap: boolean;
  internalLinks: number;
  issues: string[];
};

export type SeoAuditReport = {
  fetchedAt: string;
  baseUrl: string;
  landings: LandingAudit[];
  sitemapCount: number;
  broken: string[];
  orphan: string[];
  cannibalization: { query: string; urls: string[] }[];
  error: string | null;
};

function attr(html: string, re: RegExp): string | null {
  const m = html.match(re);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchText(url: string, timeoutMs = 8000): Promise<{ status: number; body: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "ZovusAdsAudit/1.0" },
    });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

export async function runSeoLandingAudit(): Promise<SeoAuditReport> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || getAppUrl() || "http://127.0.0.1:3000").replace(
    /\/$/,
    ""
  );
  const issuesRoot: string[] = [];
  let sitemapUrls = new Set<string>();
  try {
    const sm = await fetchText(`${baseUrl}/sitemap.xml`, 12000);
    if (sm.status >= 400) {
      issuesRoot.push(`sitemap HTTP ${sm.status}`);
    } else {
      for (const m of sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        try {
          sitemapUrls.add(new URL(m[1]).pathname);
        } catch {
          sitemapUrls.add(m[1]);
        }
      }
    }
  } catch (e) {
    issuesRoot.push(`sitemap: ${e instanceof Error ? e.message : String(e)}`);
  }

  const paths = [...new Set(["/", ...getWhitelistPaths()])];
  const landings: LandingAudit[] = [];
  const broken: string[] = [];

  for (const path of paths) {
    const url = `${baseUrl}${path}`;
    const rec: LandingAudit = {
      path,
      ok: false,
      status: null,
      title: null,
      description: null,
      h1: null,
      h1Count: 0,
      canonical: null,
      robots: null,
      noindex: false,
      schemaTypes: [],
      inSitemap: sitemapUrls.has(path) || sitemapUrls.has(path.replace(/\/$/, "") || "/"),
      internalLinks: 0,
      issues: [],
    };
    try {
      const { status, body } = await fetchText(url);
      rec.status = status;
      rec.ok = status >= 200 && status < 400;
      if (!rec.ok) {
        broken.push(path);
        rec.issues.push(`HTTP ${status}`);
      }
      rec.title = attr(body, /<title[^>]*>([\s\S]*?)<\/title>/i);
      rec.description = attr(
        body,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
      ) || attr(body, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
      const h1s = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
        decode(m[1].replace(/<[^>]+>/g, "")).trim()
      );
      rec.h1 = h1s[0] || null;
      rec.h1Count = h1s.length;
      rec.canonical = attr(body, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
      rec.robots =
        attr(body, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i) ||
        attr(body, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i);
      rec.noindex = /noindex/i.test(rec.robots || "");
      rec.schemaTypes = [...body.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
      rec.internalLinks = [...body.matchAll(/href=["'](\/[^"']+)["']/g)].length;
      if (!rec.title) rec.issues.push("missing_title");
      if (!rec.description) rec.issues.push("missing_description");
      if (!rec.h1) rec.issues.push("missing_h1");
      if (rec.h1Count > 1) rec.issues.push("multiple_h1");
      if (!rec.canonical) rec.issues.push("missing_canonical");
      if (rec.noindex) rec.issues.push("noindex");
      if (!rec.schemaTypes.length) rec.issues.push("missing_schema");
      if (!rec.inSitemap && path !== "/") rec.issues.push("not_in_sitemap");
    } catch (e) {
      rec.issues.push(e instanceof Error ? e.message : String(e));
      broken.push(path);
    }
    landings.push(rec);
  }

  const orphan = [...sitemapUrls].filter(
    (p) =>
      p.startsWith("/admin") === false &&
      p.startsWith("/api") === false &&
      !paths.includes(p) &&
      !paths.includes(p.replace(/\/$/, "") || "/")
  ).slice(0, 40);

  let cannibalization: { query: string; urls: string[] }[] = [];
  try {
    const { rows } = await adsQuery<{ cluster: string; urls: string }>(
      `SELECT cluster, string_agg(DISTINCT target_url, ',') AS urls
       FROM ads.search_query_organic
       WHERE cluster IS NOT NULL AND target_url IS NOT NULL
       GROUP BY cluster
       HAVING COUNT(DISTINCT target_url) > 3`
    );
    cannibalization = rows.map((r) => ({
      query: r.cluster,
      urls: (r.urls || "").split(",").filter(Boolean).slice(0, 8),
    }));
  } catch {
    /* table may not exist */
  }

  return {
    fetchedAt: new Date().toISOString(),
    baseUrl,
    landings,
    sitemapCount: sitemapUrls.size,
    broken,
    orphan,
    cannibalization,
    error: issuesRoot.length ? issuesRoot.join("; ") : null,
  };
}
