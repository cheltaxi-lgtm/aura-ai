import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";
import {
  buildGuestResumeCardsPayload,
  GUEST_RESUME_SPREAD_ID,
  GUEST_RESUME_SPREAD_TYPE,
  parseGuestResumeCardsPayload,
  type GuestResumeSymbol,
} from "@/lib/guest-triplet-receipt-shared";
import { computeGuestResumeFingerprint } from "@/lib/guest-triplet-receipt";
import {
  findGuestResumeByTokenHash,
  profileHasUsedGuestResume,
  type GuestResumeSessionRow,
} from "@/lib/guest-triplet-receipt-db";
import { withTransaction, queryClient } from "@/lib/db";
import { recordGuestIntroUsed } from "@/lib/rate-limit-anchors";
import type { DeckSystem } from "@/lib/decks/types";
import {
  claimBotReceipt,
  hashTgReceiptToken,
  isTgReceiptToken,
  type BotReceiptSession,
} from "./bot-receipt-client";

const RESUME_SELECT = `id, user_id, character_key, spread_type, spread_id, cards,
  guest_resume_token_hash, guest_resume_expires_at, guest_resume_status,
  guest_resume_fingerprint, guest_resume_reading_id, guest_resume_claimed_at`;

export type TelegramReceiptClaimResult =
  | {
      ok: true;
      sessionId: string;
      alreadyClaimed: boolean;
      question: string;
      symbols: GuestResumeSymbol[];
      system: string;
      masterId: string;
      fingerprint: string;
    }
  | {
      ok: false;
      code: "expired" | "invalid_token" | "already_used" | "unclaimable" | "unavailable";
    };

function toSymbols(session: BotReceiptSession): GuestResumeSymbol[] | null {
  if (!Array.isArray(session.symbols) || session.symbols.length !== 3) return null;
  const out: GuestResumeSymbol[] = [];
  for (const s of session.symbols) {
    if (
      typeof s.id !== "number" ||
      typeof s.name !== "string" ||
      typeof s.position !== "number" ||
      typeof s.reversed !== "boolean"
    ) {
      return null;
    }
    out.push({ id: s.id, name: s.name, position: s.position, reversed: s.reversed });
  }
  return out;
}

function fromRow(
  row: GuestResumeSessionRow,
  fallbackSymbols: GuestResumeSymbol[],
  fallbackSystem: string,
  fallbackMaster: string,
  fallbackFp: string,
  alreadyClaimed: boolean
): Extract<TelegramReceiptClaimResult, { ok: true }> {
  const payload = parseGuestResumeCardsPayload(row.cards);
  return {
    ok: true,
    sessionId: row.id,
    alreadyClaimed,
    question: payload?.question || "",
    symbols: payload?.symbols || fallbackSymbols,
    system: payload?.system || fallbackSystem,
    masterId: row.character_key || fallbackMaster,
    fingerprint: row.guest_resume_fingerprint || fallbackFp,
  };
}

/**
 * Claim a Telegram bot guest receipt into the user's site session.
 * Does not trust URL cards — only bot internal claim response.
 */
export async function claimTelegramBotReceipt(opts: {
  token: string;
  profileUserId: string;
}): Promise<TelegramReceiptClaimResult> {
  if (!isTgReceiptToken(opts.token)) {
    return { ok: false, code: "invalid_token" };
  }

  const tokenHash = hashTgReceiptToken(opts.token);

  const existing = await findGuestResumeByTokenHash(tokenHash);
  if (
    existing &&
    (existing.guest_resume_status === "claimed" ||
      existing.guest_resume_status === "reading_consumed") &&
    existing.user_id === opts.profileUserId
  ) {
    return fromRow(existing, [], "tarot-veronika", GUEST_TRIPLET_MASTER_ID, "", true);
  }

  const bot = await claimBotReceipt({
    token: opts.token,
    zovusUserId: opts.profileUserId,
  });

  if (!bot.ok) {
    if (bot.error === "expired") return { ok: false, code: "expired" };
    if (bot.error === "unclaimable") return { ok: false, code: "unclaimable" };
    if (bot.error === "already_claimed") return { ok: false, code: "unavailable" };
    return { ok: false, code: "invalid_token" };
  }

  const symbols = toSymbols(bot.session);
  if (!symbols) return { ok: false, code: "unavailable" };

  const system = (bot.session.system || "tarot-veronika") as DeckSystem;
  const masterId = bot.session.master || GUEST_TRIPLET_MASTER_ID;
  const fingerprint =
    bot.session.fingerprint ||
    computeGuestResumeFingerprint({
      system,
      masterId,
      spreadId: bot.session.spread_id || GUEST_RESUME_SPREAD_ID,
      symbols,
    });

  const payload = buildGuestResumeCardsPayload({
    question: bot.session.question || "",
    system,
    symbols,
  });
  if (bot.session.teaser_text) {
    payload.teaser = {
      text: bot.session.teaser_text,
      promptVersion: "telegram-bot",
      model: "telegram-bot",
      createdAt: bot.session.created_at,
    };
  }

  return withTransaction(async (client) => {
    await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `guest-resume-user:${opts.profileUserId}`,
    ]);
    await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `tg-receipt:${tokenHash}`,
    ]);

    const again = await findGuestResumeByTokenHash(tokenHash, client);
    if (
      again &&
      (again.guest_resume_status === "claimed" ||
        again.guest_resume_status === "reading_consumed") &&
      again.user_id === opts.profileUserId
    ) {
      return fromRow(again, symbols, system, masterId, fingerprint, true);
    }

    if (await profileHasUsedGuestResume(opts.profileUserId, { client })) {
      return { ok: false as const, code: "already_used" as const };
    }

    try {
      const { rows } = await queryClient<GuestResumeSessionRow>(
        client,
        `INSERT INTO sessions (
           user_id, character_key, spread_type, spread_id, cards,
           guest_resume_token_hash, guest_resume_expires_at, guest_resume_status,
           guest_resume_fingerprint, guest_resume_claimed_at, status
         ) VALUES (
           $1, $2, $3, $4, $5::jsonb,
           $6, $7, 'claimed',
           $8, NOW(), 'active'
         )
         RETURNING ${RESUME_SELECT}`,
        [
          opts.profileUserId,
          masterId,
          GUEST_RESUME_SPREAD_TYPE,
          bot.session.spread_id || GUEST_RESUME_SPREAD_ID,
          JSON.stringify(payload),
          tokenHash,
          bot.session.expires_at,
          fingerprint,
        ]
      );

      const row = rows[0];
      if (!row) return { ok: false as const, code: "unavailable" as const };

      try {
        await recordGuestIntroUsed(opts.profileUserId, new Date(), client);
      } catch {
        /* non-fatal */
      }

      return fromRow(row, symbols, system, masterId, fingerprint, Boolean(bot.alreadyClaimed));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate/i.test(msg)) {
        const conflict = await findGuestResumeByTokenHash(tokenHash, client);
        if (
          conflict &&
          conflict.user_id === opts.profileUserId &&
          (conflict.guest_resume_status === "claimed" ||
            conflict.guest_resume_status === "reading_consumed")
        ) {
          return fromRow(conflict, symbols, system, masterId, fingerprint, true);
        }
      }
      throw err;
    }
  });
}
