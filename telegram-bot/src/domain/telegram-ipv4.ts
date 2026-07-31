/**
 * Force IPv4 for Telegram Bot API traffic.
 * On some VPS (incl. Beget) IPv6 routes to api.telegram.org hang → ETIMEDOUT,
 * which freezes long-poll getUpdates and makes the bot look "dead".
 *
 * IMPORTANT: do NOT set this short-timeout agent as the process-wide dispatcher.
 * siteFetch → localhost matrix/photo runs need minutes; a 30s headersTimeout
 * aborts them as "Связь с сайтом недоступна" while the site is still generating.
 */
import { Agent, fetch as undiciFetch } from "undici";

const telegramAgent = new Agent({
  connect: { family: 4, timeout: 10_000 },
  /** Long-poll getUpdates holds 1 connection; keep headroom for sendPhoto/sendMessage. */
  connections: 32,
  pipelining: 1,
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
  headersTimeout: 30_000,
  bodyTimeout: 45_000,
} as ConstructorParameters<typeof Agent>[0]);

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
  console.log("[net] Telegram HTTP pinned to IPv4 (site bridge uses long timeouts)");
}

/** grammY-compatible fetch pinned to IPv4. */
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
