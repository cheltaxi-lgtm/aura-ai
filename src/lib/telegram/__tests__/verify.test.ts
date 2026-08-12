/**
 * Run: npx tsx src/lib/telegram/__tests__/verify.test.ts
 */
import { createHash, createHmac } from "node:crypto";
import { verifyTelegramLoginWidget } from "../verify";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const token = "test-bot-token-for-hmac";
process.env.TELEGRAM_BOT_TOKEN = token;
process.env.TELEGRAM_AUTH_MAX_AGE_SEC = "3600";

function sign(fields: Record<string, string | number>): string {
  const pairs = Object.entries(fields)
    .filter(([k]) => k !== "hash")
    .map(([k, v]) => [k, String(v)] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHash("sha256").update(token).digest();
  return createHmac("sha256", secret).update(dataCheckString).digest("hex");
}

const now = Math.floor(Date.now() / 1000);
const base = {
  id: 123456789,
  first_name: "Test",
  username: "tester",
  auth_date: now,
};

const goodHash = sign(base);
const ok = verifyTelegramLoginWidget({ ...base, hash: goodHash }, now);
assert(ok.ok === true, "valid signature accepted");

const bad = verifyTelegramLoginWidget({ ...base, hash: "0".repeat(64) }, now);
assert(bad.ok === false && bad.reason === "invalid_signature", "bad sig rejected");

const expired = verifyTelegramLoginWidget(
  {
    ...base,
    auth_date: now - 200_000,
    hash: sign({ ...base, auth_date: now - 200_000 }),
  },
  now
);
assert(expired.ok === false && expired.reason === "expired", "expired rejected");

// No side effects on invalid — just ensure no throw and fail closed
const noToken = verifyTelegramLoginWidget({ ...base, hash: goodHash }, now);
process.env.TELEGRAM_BOT_TOKEN = "";
const missing = verifyTelegramLoginWidget({ ...base, hash: goodHash }, now);
assert(missing.ok === false && missing.reason === "not_configured", "missing token");
process.env.TELEGRAM_BOT_TOKEN = token;
void noToken;

console.log("ok: telegram verify HMAC + expiry");
