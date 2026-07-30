/**
 * Force IPv4 for Telegram Bot API traffic.
 * On some VPS (incl. Beget) IPv6 routes to api.telegram.org hang → ETIMEDOUT,
 * which freezes long-poll getUpdates and makes the bot look "dead".
 */
import { Agent, setGlobalDispatcher, fetch as undiciFetch } from "undici";

const agent = new Agent({
  connect: { family: 4 },
  connections: 8,
  pipelining: 1,
} as ConstructorParameters<typeof Agent>[0]);

let installed = false;

export function installTelegramIpv4Networking(): void {
  if (installed) return;
  installed = true;
  setGlobalDispatcher(agent);
  console.log("[net] Telegram HTTP pinned to IPv4");
}

/** grammY-compatible fetch pinned to IPv4. */
export function telegramFetch(
  input: Parameters<typeof undiciFetch>[0],
  init?: Parameters<typeof undiciFetch>[1]
): ReturnType<typeof undiciFetch> {
  return undiciFetch(input, { ...init, dispatcher: agent });
}
