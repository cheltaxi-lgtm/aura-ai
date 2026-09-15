import type { NextRequest } from "next/server";

import {
  readGuestBindingCookie,
  readGuestResumeCookie,
} from "@/lib/guest-resume-cookie";
import {
  hashGuestResumeToken,
  isGuestResumeToken,
  parseGuestResumeCardsPayload,
} from "@/lib/guest-triplet-receipt";
import {
  expireIssuedGuestResumeIfNeeded,
  findGuestResumeByTokenHash,
  type GuestResumeSessionRow,
} from "@/lib/guest-triplet-receipt-db";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";
import { evaluateGuestClaimBinding } from "@/lib/session-claim";

export type PendingGuestResume = {
  receipt: GuestResumeSessionRow;
  token: string;
  masterId: string;
  payload: NonNullable<ReturnType<typeof parseGuestResumeCardsPayload>>;
};

/**
 * Resolve the browser's active anonymous receipt using both HttpOnly proofs.
 * A possession cookie alone never reveals or reuses a saved spread.
 */
export async function resolvePendingGuestResume(
  request: NextRequest
): Promise<PendingGuestResume | null> {
  const token = await readGuestResumeCookie(request);
  if (!token || !isGuestResumeToken(token)) return null;

  const found = await findGuestResumeByTokenHash(hashGuestResumeToken(token));
  if (!found) return null;
  const receipt = await expireIssuedGuestResumeIfNeeded(found);
  if (receipt.guest_resume_status !== "issued" || receipt.user_id) return null;

  const bindingToken = await readGuestBindingCookie(request);
  const binding = await evaluateGuestClaimBinding(receipt.id, bindingToken);
  if (!binding.bindingOk) return null;

  const payload = parseGuestResumeCardsPayload(receipt.cards);
  if (!payload) return null;

  return {
    receipt,
    token,
    masterId: receipt.character_key || GUEST_TRIPLET_MASTER_ID,
    payload,
  };
}

export function serializePendingGuestResume(pending: PendingGuestResume) {
  return {
    masterId: pending.masterId,
    spreadId: pending.receipt.spread_id || "triplet",
    question: pending.payload.question,
    system: pending.payload.system,
    cards: [...pending.payload.symbols].sort((a, b) => a.position - b.position),
    teaser: pending.payload.teaser?.text ?? "",
    completedAt: new Date(pending.receipt.created_at).toISOString(),
    expiresAt: pending.receipt.guest_resume_expires_at,
  };
}
