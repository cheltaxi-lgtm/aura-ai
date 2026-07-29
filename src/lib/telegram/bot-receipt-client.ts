import { createHash } from "node:crypto";

export type BotReceiptSymbol = {
  id: number;
  name: string;
  position: number;
  reversed: boolean;
};

export type BotReceiptSession = {
  id: string;
  question: string;
  symbols: BotReceiptSymbol[];
  system: string;
  master: string;
  spread_id: string;
  fingerprint: string | null;
  expires_at: string;
  created_at: string;
  claimed_at: string | null;
  teaser_text: string | null;
};

export type BotClaimResult =
  | { ok: true; alreadyClaimed: boolean; session: BotReceiptSession }
  | {
      ok: false;
      error: "unauthorized" | "invalid_token" | "expired" | "already_claimed" | "unclaimable" | "unavailable";
    };

function baseUrl(): string {
  return (process.env.BOT_INTERNAL_BASE_URL || "").replace(/\/$/, "");
}

function secret(): string {
  return process.env.BOT_INTERNAL_SECRET?.trim() || "";
}

export function hashTgReceiptToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isTgReceiptToken(value: string): boolean {
  return /^zg_[A-Za-z0-9_-]{40,}$/.test(value);
}

export async function claimBotReceipt(opts: {
  token: string;
  zovusUserId: string;
}): Promise<BotClaimResult> {
  const url = baseUrl();
  const sec = secret();
  if (!url || !sec) {
    return { ok: false, error: "unavailable" };
  }

  try {
    const res = await fetch(`${url}/internal/receipt/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bot-Internal-Secret": sec,
      },
      body: JSON.stringify({
        token: opts.token,
        zovus_user_id: opts.zovusUserId,
      }),
      cache: "no-store",
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      alreadyClaimed?: boolean;
      session?: BotReceiptSession;
      error?: string;
    };

    if (res.status === 401) return { ok: false, error: "unauthorized" };
    if (res.status === 410 || data.error === "expired") {
      return { ok: false, error: "expired" };
    }
    if (data.error === "unclaimable") return { ok: false, error: "unclaimable" };
    if (data.error === "already_claimed") return { ok: false, error: "already_claimed" };
    if (!res.ok || !data.ok || !data.session) {
      return { ok: false, error: "invalid_token" };
    }

    return {
      ok: true,
      alreadyClaimed: Boolean(data.alreadyClaimed),
      session: data.session,
    };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
