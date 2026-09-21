import assert from "node:assert/strict";
import { Agent, ProxyAgent } from "undici";

process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "123456:offline";

const { createTelegramDispatcher } = await import("../telegram-ipv4.js");

const direct = createTelegramDispatcher();
assert(direct instanceof Agent, "empty proxy config must keep the IPv4 direct agent");
await direct.close();

const proxy = createTelegramDispatcher("http://127.0.0.1:3128");
assert(proxy instanceof ProxyAgent, "configured Telegram proxy must use ProxyAgent");
await proxy.close();

console.log("telegram network: PASS (direct fallback, proxy selection)");
