"use client";

import { saveGuestResumeUiCache } from "@/lib/guest-resume-ui-cache";

const STORAGE_KEY = "zovus_tg_receipt";

export function stashTgReceipt(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
}

export function takeStashedTgReceipt(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v) sessionStorage.removeItem(STORAGE_KEY);
    return v;
  } catch {
    return null;
  }
}

export type TgClaimClientResult =
  | { ok: true; sessionId: string; alreadyClaimed: boolean }
  | { ok: false; code: string; message: string };

export async function claimTgReceiptClient(token: string): Promise<TgClaimClientResult> {
  const res = await fetch("/api/guest-triplet/telegram-claim", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tg_receipt: token }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    sessionId?: string;
    alreadyClaimed?: boolean;
    masterId?: string;
    question?: string;
    system?: string;
    cards?: Array<{ id: number; name: string; position: number; reversed: boolean }>;
    error?: string;
    code?: string;
    message?: string;
  };

  if (!res.ok || !data.ok || !data.sessionId) {
    return {
      ok: false,
      code: data.code || data.error || "unavailable",
      message:
        data.message ||
        (res.status === 410
          ? "Срок этого расклада истёк. Можно сделать новый на главной."
          : "Не удалось перенести расклад. Попробуйте войти снова."),
    };
  }

  saveGuestResumeUiCache({
    version: 1,
    origin: "guest",
    masterId: data.masterId || "veronika",
    system: data.system || "tarot-veronika",
    spreadId: "triplet",
    question: data.question || "",
    teaser: "",
    cards: data.cards || [],
    completedAt: new Date().toISOString(),
    claimedSessionId: data.sessionId,
    phase: "reading_ready",
  });

  return {
    ok: true,
    sessionId: data.sessionId,
    alreadyClaimed: Boolean(data.alreadyClaimed),
  };
}
