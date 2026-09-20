/**
 * Route Telegram Bot API traffic through an optional HTTPS CONNECT proxy.
 * Direct mode stays IPv4-only because some VPS IPv6 routes hang. Production can
 * use a stable egress proxy when the hosting provider's direct route drops packets.
 *
 * IMPORTANT: do NOT set this short-timeout agent as the process-wide dispatcher.
 * siteFetch → localhost matrix/photo runs need minutes; short Telegram timeouts
 * aborts them as "Связь с сайтом недоступна" while the site is still generating.
 */
import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { botConfig } from "../config.js";

export function createTelegramDispatcher(proxyUrl = ""): Dispatcher {
  if (proxyUrl) {
    return new ProxyAgent({
      uri: proxyUrl,
      connect: { timeout: 10_000 },
      /** One long poll plus message/media sends; keep below the shared proxy cap. */
      connections: 16,
      pipelining: 1,
      headersTimeout: 30_000,
      bodyTimeout: 45_000,
    });
  }
  return new Agent({
    connect: { family: 4, timeout: 10_000 },
    /** Long-poll getUpdates holds 1 connection; keep headroom for sendPhoto/sendMessage. */
    connections: 32,
    pipelining: 1,
    keepAliveTimeout: 10_000,
    keepAliveMaxTimeout: 30_000,
    headersTimeout: 30_000,
    bodyTimeout: 45_000,
  } as ConstructorParameters<typeof Agent>[0]);
}

const telegramAgent = createTelegramDispatcher(botConfig.telegramHttpsProxy);

/** Loopback site bridge — matrix/photo generation can take several minutes. */
const siteAgent = new Agent({
  connect: { family: 4, timeout: 10_000 },
  connections: 16,
  pipelining: 1,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  headersTimeout: 420_000,
  bodyTimeout: 420_000,
} as ConstructorParameters<typeof Agent>[0]);

let installed = false;

export function installTelegramIpv4Networking(): void {
  if (installed) return;
  installed = true;
  const route = botConfig.telegramHttpsProxy
    ? `proxy ${new URL(botConfig.telegramHttpsProxy).host}`
    : "direct IPv4";
  console.log(`[net] Telegram HTTP via ${route} (site bridge uses long timeouts)`);
}

/** grammY-compatible fetch using the configured Telegram-only dispatcher. */
export function telegramFetch(
  input: Parameters<typeof undiciFetch>[0],
  init?: Parameters<typeof undiciFetch>[1]
): ReturnType<typeof undiciFetch> {
  return undiciFetch(input, { ...init, dispatcher: telegramAgent });
}

/** Internal site API fetch (matrix/photo/numerology) — long headers/body budget. */
export function siteBridgeFetch(
  input: Parameters<typeof undiciFetch>[0],
  init?: Parameters<typeof undiciFetch>[1]
): ReturnType<typeof undiciFetch> {
  return undiciFetch(input, { ...init, dispatcher: siteAgent });
}
