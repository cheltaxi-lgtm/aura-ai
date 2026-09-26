/** Public campaign labels only. Never forward questions, contact data or auth tokens. */
const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
const SAFE_LABEL = /^[\p{L}\p{N}_.-]{1,100}$/u;

export function copyCampaignParams(target: URLSearchParams, search: string): void {
  const source = new URLSearchParams(search);
  for (const key of CAMPAIGN_KEYS) {
    const value = source.get(key);
    if (value && SAFE_LABEL.test(value)) target.set(key, value);
  }
}

export function analyticsPageUrl(href: string): string {
  const url = new URL(href);
  const params = new URLSearchParams();
  copyCampaignParams(params, url.search);
  return url.origin + url.pathname + (params.size ? `?${params}` : "");
}
