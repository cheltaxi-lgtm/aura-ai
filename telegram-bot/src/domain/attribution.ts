import type { Attribution } from "../db/repos.js";

/** Parse /start payload: ref_xxx, utm_source=..., master=veronika, or querystring-like. */
export function parseStartPayload(raw?: string): Attribution {
  if (!raw?.trim()) return {};
  const text = raw.trim();
  const out: Attribution = {};

  if (text.startsWith("ref_")) {
    out.ref = text.slice(4);
    return out;
  }
  if (/^r[a-z0-9]+$/i.test(text)) {
    out.ref = text;
    return out;
  }

  const normalized = text.includes("=") || text.includes("&") ? text : `ref=${text}`;
  const params = new URLSearchParams(normalized.replace(/__/g, "&").replace(/-/g, "="));

  const pick = (k: string) => {
    const v = params.get(k)?.trim();
    return v || undefined;
  };

  out.ref = pick("ref");
  out.utm_source = pick("utm_source") ?? pick("utmSource");
  out.utm_medium = pick("utm_medium") ?? pick("utmMedium");
  out.utm_campaign = pick("utm_campaign") ?? pick("utmCampaign");
  out.utm_content = pick("utm_content") ?? pick("utmContent");
  out.master = pick("master");

  // bare token fallback
  if (!out.ref && !out.utm_source && !text.includes("=")) {
    out.ref = text.slice(0, 64);
  }
  return out;
}
