/**
 * Live provider probes for diagnostics. Never returns secret values.
 */
import { adsSourceTokenFlags, metrikaCounterId, metrikaToken, webmasterHostId, webmasterToken } from "./env";

export type ProviderProbe = {
  provider: "direct" | "metrika" | "webmaster" | "wordstat";
  configured: boolean;
  auth: "ok" | "fail" | "unknown";
  api: "ok" | "fail" | "skipped";
  last_sync: string | null;
  rows: number | null;
  freshnessHours: number | null;
  error: string | null;
};

function redact(s: string): string {
  return s
    .replace(/y0_[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/OAuth\s+\S+/gi, "OAuth [redacted]")
    .slice(0, 180);
}

async function httpJson(
  url: string,
  init: RequestInit
): Promise<{ status: number; ok: boolean; body: string }> {
  const res = await fetch(url, init);
  const body = await res.text();
  return { status: res.status, ok: res.ok, body };
}

export async function probeDirect(): Promise<Pick<ProviderProbe, "configured" | "auth" | "api" | "error">> {
  const configured = Boolean(process.env.ADS_DIRECT_TOKEN);
  if (!configured) {
    return { configured: false, auth: "fail", api: "skipped", error: "ADS_DIRECT_TOKEN missing" };
  }
  try {
    const { status, ok, body } = await httpJson("https://api.direct.yandex.com/json/v5/campaigns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ADS_DIRECT_TOKEN}`,
        "Client-Login": process.env.ADS_DIRECT_LOGIN || "",
        "Accept-Language": "ru",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "get",
        params: { SelectionCriteria: {}, FieldNames: ["Id", "Name"] },
      }),
    });
    let parsed: { error?: { error_string?: string } } = {};
    try {
      parsed = JSON.parse(body) as { error?: { error_string?: string } };
    } catch {
      /* not json */
    }
    if (status === 401 || status === 403) {
      return { configured: true, auth: "fail", api: "fail", error: redact(`HTTP ${status}`) };
    }
    if (parsed.error?.error_string) {
      const msg = parsed.error.error_string;
      const authFail = /логин не подключен|access|token|auth/i.test(msg);
      return {
        configured: true,
        auth: authFail ? "fail" : "ok",
        api: "fail",
        error: redact(msg),
      };
    }
    if (!ok) {
      return { configured: true, auth: "unknown", api: "fail", error: redact(`HTTP ${status}`) };
    }
    return { configured: true, auth: "ok", api: "ok", error: null };
  } catch (e) {
    return {
      configured: true,
      auth: "unknown",
      api: "fail",
      error: redact(e instanceof Error ? e.message : String(e)),
    };
  }
}

export async function probeMetrika(): Promise<Pick<ProviderProbe, "configured" | "auth" | "api" | "error">> {
  const token = metrikaToken();
  const counter = metrikaCounterId();
  const configured = Boolean(token && counter);
  if (!configured) {
    return {
      configured: false,
      auth: "fail",
      api: "skipped",
      error: "METRIKA_TOKEN/COUNTER missing",
    };
  }
  try {
    const { status, ok, body } = await httpJson(
      `https://api-metrika.yandex.net/management/v1/counter/${encodeURIComponent(counter!)}`,
      { headers: { Authorization: `OAuth ${token}` } }
    );
    if (status === 401 || status === 403) {
      return { configured: true, auth: "fail", api: "fail", error: redact(`HTTP ${status} ${body}`) };
    }
    if (!ok) {
      return { configured: true, auth: "unknown", api: "fail", error: redact(`HTTP ${status} ${body}`) };
    }
    return { configured: true, auth: "ok", api: "ok", error: null };
  } catch (e) {
    return {
      configured: true,
      auth: "unknown",
      api: "fail",
      error: redact(e instanceof Error ? e.message : String(e)),
    };
  }
}

export async function probeWebmaster(): Promise<Pick<ProviderProbe, "configured" | "auth" | "api" | "error">> {
  const token = webmasterToken();
  const configured = Boolean(token);
  if (!configured) {
    return {
      configured: false,
      auth: "fail",
      api: "skipped",
      error: "WEBMASTER_TOKEN (or Metrika/Direct OAuth fallback) missing",
    };
  }
  try {
    const { status, ok, body } = await httpJson("https://api.webmaster.yandex.net/v4/user", {
      headers: { Authorization: `OAuth ${token}` },
    });
    if (status === 401 || status === 403) {
      return { configured: true, auth: "fail", api: "fail", error: redact(`HTTP ${status} ${body}`) };
    }
    if (!ok) {
      return { configured: true, auth: "unknown", api: "fail", error: redact(`HTTP ${status} ${body}`) };
    }
    return { configured: true, auth: "ok", api: "ok", error: null };
  } catch (e) {
    return {
      configured: true,
      auth: "unknown",
      api: "fail",
      error: redact(e instanceof Error ? e.message : String(e)),
    };
  }
}

export async function probeWordstat(): Promise<Pick<ProviderProbe, "configured" | "auth" | "api" | "error">> {
  const token = process.env.WORDSTAT_TOKEN || process.env.ADS_DIRECT_TOKEN;
  const configured = Boolean(token);
  if (!configured) {
    return {
      configured: false,
      auth: "fail",
      api: "skipped",
      error: "WORDSTAT_TOKEN and ADS_DIRECT_TOKEN missing",
    };
  }
  try {
    const { status, ok, body } = await httpJson("https://api.direct.yandex.ru/live/v4/json/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GetVersion", token }),
    });
    if (status === 401 || status === 403) {
      return { configured: true, auth: "fail", api: "fail", error: redact(`HTTP ${status}`) };
    }
    if (!ok) {
      return { configured: true, auth: "unknown", api: "fail", error: redact(`HTTP ${status} ${body}`) };
    }
    return { configured: true, auth: "ok", api: "ok", error: null };
  } catch (e) {
    return {
      configured: true,
      auth: "unknown",
      api: "fail",
      error: redact(e instanceof Error ? e.message : String(e)),
    };
  }
}

export function envPresenceFlags() {
  const t = adsSourceTokenFlags();
  return {
    ADS_DIRECT_TOKEN: t.ADS_DIRECT_TOKEN,
    ADS_DIRECT_LOGIN: Boolean(process.env.ADS_DIRECT_LOGIN),
    METRIKA_TOKEN: t.METRIKA_TOKEN,
    METRIKA_COUNTER_ID: Boolean(metrikaCounterId()),
    WEBMASTER_TOKEN_DEDICATED: Boolean(process.env.WEBMASTER_TOKEN),
    WEBMASTER_TOKEN: t.WEBMASTER_TOKEN,
    WEBMASTER_HOST_ID: Boolean(webmasterHostId()),
    WORDSTAT_TOKEN: t.WORDSTAT_TOKEN,
    WORDSTAT_OR_DIRECT: Boolean(process.env.WORDSTAT_TOKEN || process.env.ADS_DIRECT_TOKEN),
  };
}
