import { fetch as undiciFetch, ProxyAgent, type RequestInit as UndiciRequestInit } from "undici";

const OPENROUTER_HOST = "openrouter.ai";
const PROXY_RETRY_STATUSES = new Set([403, 407, 502, 503, 504]);

function isOpenRouterUrl(url: string): boolean {
  try {
    return new URL(url).hostname === OPENROUTER_HOST;
  } catch {
    return url.includes(OPENROUTER_HOST);
  }
}

function proxyUrlFromEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw || undefined;
}

async function fetchViaProxy(
  url: string,
  init: RequestInit | undefined,
  proxyUrl: string | undefined
): Promise<Response> {
  const options: UndiciRequestInit = { ...(init as UndiciRequestInit) };
  if (proxyUrl) {
    options.dispatcher = new ProxyAgent(proxyUrl);
  }
  return undiciFetch(url, options) as unknown as Response;
}

/**
 * OpenRouter requests: primary via OPENROUTER_HTTPS_PROXY (Latvia),
 * fallback without proxy (wg-foxdpi split routes on prod when configured).
 */
export async function openRouterFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  if (!isOpenRouterUrl(url)) {
    return fetch(url, init);
  }

  const primaryProxy = proxyUrlFromEnv("OPENROUTER_HTTPS_PROXY");
  if (!primaryProxy) {
    return fetch(url, init);
  }

  try {
    const primary = await fetchViaProxy(url, init, primaryProxy);
    if (primary.ok || !PROXY_RETRY_STATUSES.has(primary.status)) {
      return primary;
    }
  } catch (error) {
    console.warn("[openrouter] primary proxy failed:", error);
  }

  return fetch(url, init);
}
