/**
 * Single source of truth for Direct API endpoint selection (sandbox vs
 * production). Every caller — sync client, reports, diagnostics probe — must
 * resolve the endpoint here so diagnostics can never disagree with sync.
 */
export function isDirectSandbox(): boolean {
  return process.env.ADS_DIRECT_SANDBOX === "1" || process.env.ADS_DIRECT_SANDBOX === "true";
}

export function directApiUrl(): string {
  return isDirectSandbox()
    ? "https://api-sandbox.direct.yandex.com/json/v5"
    : "https://api.direct.yandex.com/json/v5";
}
