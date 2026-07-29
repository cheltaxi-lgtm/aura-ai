import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TelegramLoginPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export type TelegramVerifyResult =
  | { ok: true; data: TelegramLoginPayload }
  | { ok: false; reason: "invalid_signature" | "expired" | "bad_payload" | "not_configured" };

function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

export function telegramAuthMaxAgeSec(): number {
  const raw = process.env.TELEGRAM_AUTH_MAX_AGE_SEC?.trim();
  const n = raw ? Number(raw) : 86_400;
  return Number.isFinite(n) && n > 0 ? n : 86_400;
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a.toLowerCase(), "hex");
    const bb = Buffer.from(b.toLowerCase(), "hex");
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function checkAuthDate(authDate: number, nowSec: number): boolean {
  if (!Number.isFinite(authDate)) return false;
  if (authDate > nowSec + 60) return false;
  return nowSec - authDate <= telegramAuthMaxAgeSec();
}

/** Login Widget: secret = SHA256(bot_token), HMAC-SHA256(data-check-string, secret). */
export function verifyTelegramLoginWidget(
  input: Record<string, unknown>,
  nowSec: number = Math.floor(Date.now() / 1000)
): TelegramVerifyResult {
  const token = botToken();
  if (!token) return { ok: false, reason: "not_configured" };

  const hash = typeof input.hash === "string" ? input.hash : "";
  if (!/^[a-f0-9]{64}$/i.test(hash)) return { ok: false, reason: "bad_payload" };

  const id = typeof input.id === "number" ? input.id : Number(input.id);
  const authDate =
    typeof input.auth_date === "number" ? input.auth_date : Number(input.auth_date);
  const firstName = typeof input.first_name === "string" ? input.first_name.trim() : "";
  if (!Number.isFinite(id) || id <= 0 || !firstName) {
    return { ok: false, reason: "bad_payload" };
  }
  if (!checkAuthDate(authDate, nowSec)) {
    return { ok: false, reason: "expired" };
  }

  const fields: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(input)) {
    if (key === "hash" || value == null || value === "") continue;
    fields.push([key, String(value)]);
  }
  fields.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = fields.map(([k, v]) => `${k}=${v}`).join("\n");

  const secret = createHash("sha256").update(token).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqualHex(computed, hash)) {
    return { ok: false, reason: "invalid_signature" };
  }

  return {
    ok: true,
    data: {
      id,
      first_name: firstName,
      last_name: typeof input.last_name === "string" ? input.last_name : undefined,
      username: typeof input.username === "string" ? input.username : undefined,
      photo_url: typeof input.photo_url === "string" ? input.photo_url : undefined,
      auth_date: authDate,
      hash: hash.toLowerCase(),
    },
  };
}

/**
 * Mini App initData verification (future).
 * secret_key = HMAC_SHA256(key="WebAppData", bot_token)
 */
export function verifyTelegramWebAppInitData(
  initData: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): TelegramVerifyResult {
  const token = botToken();
  if (!token) return { ok: false, reason: "not_configured" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash") || "";
  if (!/^[a-f0-9]{64}$/i.test(hash)) return { ok: false, reason: "bad_payload" };

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqualHex(computed, hash)) {
    return { ok: false, reason: "invalid_signature" };
  }

  const authDate = Number(params.get("auth_date"));
  if (!checkAuthDate(authDate, nowSec)) {
    return { ok: false, reason: "expired" };
  }

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, reason: "bad_payload" };
  let user: Record<string, unknown>;
  try {
    user = JSON.parse(userRaw) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "bad_payload" };
  }

  const id = typeof user.id === "number" ? user.id : Number(user.id);
  const firstName = typeof user.first_name === "string" ? user.first_name.trim() : "";
  if (!Number.isFinite(id) || id <= 0 || !firstName) {
    return { ok: false, reason: "bad_payload" };
  }

  return {
    ok: true,
    data: {
      id,
      first_name: firstName,
      last_name: typeof user.last_name === "string" ? user.last_name : undefined,
      username: typeof user.username === "string" ? user.username : undefined,
      photo_url: typeof user.photo_url === "string" ? user.photo_url : undefined,
      auth_date: authDate,
      hash: hash.toLowerCase(),
    },
  };
}
