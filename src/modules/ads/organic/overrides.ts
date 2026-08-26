/**
 * Public reader for ads.seo_override. Fail-open: missing DB → empty object.
 */
import { cache } from "react";
import { getAppUrl } from "@/lib/brand";
import { adsQuery } from "../db";
import { isLandingWhitelisted } from "../validator";

export const SEO_OVERRIDE_FIELDS = [
  "title",
  "description",
  "h1",
  "canonical",
  "robots",
  "schema_json",
  "internal_links",
] as const;

export type SeoOverrideField = (typeof SEO_OVERRIDE_FIELDS)[number];

export type SeoInternalLink = { href: string; label: string };

export type AppliedSeoOverrides = {
  title?: string;
  description?: string;
  h1?: string;
  canonical?: string;
  robots?: string;
  schema_json?: string;
  internal_links?: SeoInternalLink[];
};

export function isSeoOverrideField(value: string): value is SeoOverrideField {
  return (SEO_OVERRIDE_FIELDS as readonly string[]).includes(value);
}

export function normalizeOverridePath(path: string): string {
  const raw = (path || "/").trim();
  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname;
  } catch {
    pathname = raw.split("?")[0] || "/";
  }
  pathname = pathname.split("?")[0] || "/";
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  const stripped = pathname.replace(/\/+$/, "");
  return stripped || "/";
}

export function parseInternalLinksJson(raw: string | null | undefined): SeoInternalLink[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const out: SeoInternalLink[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const hrefRaw = typeof rec.href === "string" ? rec.href : typeof rec.to === "string" ? rec.to : "";
      const href = normalizeOverridePath(hrefRaw);
      if (!href || href === "/" || seen.has(href)) continue;
      if (!isLandingWhitelisted(href)) continue;
      const label =
        (typeof rec.label === "string" && rec.label.trim()) ||
        (typeof rec.anchor === "string" && rec.anchor.trim()) ||
        href;
      seen.add(href);
      out.push({ href, label: label.slice(0, 80) });
    }
    return out;
  } catch {
    return [];
  }
}

export function mergeInternalLinks(
  current: SeoInternalLink[] | undefined,
  incoming: SeoInternalLink[]
): SeoInternalLink[] {
  const seen = new Set<string>();
  const out: SeoInternalLink[] = [];
  for (const link of [...(current ?? []), ...incoming]) {
    if (!link.href || seen.has(link.href)) continue;
    if (!isLandingWhitelisted(link.href)) continue;
    seen.add(link.href);
    out.push(link);
    if (out.length >= 12) break;
  }
  return out;
}

/** Same-origin canonical only. Off-site hosts are dropped (SEO hijack). */
export function pinCanonicalToAppOrigin(canonical: string, appUrl = getAppUrl()): string | null {
  const base = (appUrl || "").trim().replace(/\/$/, "");
  if (!canonical?.trim() || !base) return null;
  let app: URL;
  try {
    app = new URL(base.includes("://") ? base : `https://${base}`);
  } catch {
    return null;
  }
  let url: URL;
  try {
    url = new URL(canonical.trim(), app);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.hostname !== app.hostname) return null;
  const path = (url.pathname.replace(/\/+$/, "") || "/") + url.search;
  return `${app.origin}${path}`;
}

/**
 * JSON-LD safe for a <script> HTML context.
 * Parse first so JSON \\u003c escapes decode, then re-escape every U+003C
 * so a crafted </script> cannot break out of AdsSeoJsonLd.
 */
export function sanitizeSchemaJson(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return JSON.stringify(parsed).replace(/</g, "\\u003c");
  } catch {
    return null;
  }
}

export const getAppliedSeoOverrides = cache(async (path: string): Promise<AppliedSeoOverrides> => {
  const normalized = normalizeOverridePath(path);
  try {
    const { rows } = await adsQuery<{ field: string; new_value: string | null }>(
      `SELECT field, new_value FROM ads.seo_override
       WHERE path = $1 AND applied = TRUE`,
      [normalized]
    );
    const out: AppliedSeoOverrides = {};
    for (const row of rows) {
      if (!isSeoOverrideField(row.field) || !row.new_value) continue;
      if (row.field === "internal_links") {
        out.internal_links = parseInternalLinksJson(row.new_value);
      } else if (row.field === "schema_json") {
        const safe = sanitizeSchemaJson(row.new_value);
        if (safe) out.schema_json = safe;
      } else if (row.field === "canonical") {
        const pinned = pinCanonicalToAppOrigin(row.new_value);
        if (pinned) out.canonical = pinned;
      } else {
        out[row.field] = row.new_value;
      }
    }
    return out;
  } catch {
    return {};
  }
});
