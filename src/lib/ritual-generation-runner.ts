import { captureMemoryGeneration } from "@/lib/memory/write-guard";
import { BillingService } from "@/lib/services/billing-service";
import { queryClient, withTransaction } from "@/lib/db";
import { withReadingLock } from "@/lib/reading-lock";
import {
  buildRitualAnswersMessage,
  captureRitualMemory,
} from "@/lib/memory/capture-helpers";
import { buildMemoryContext } from "@/lib/memory/build-memory-context";
import {
  attemptRitualGeneration,
  getRitualById,
  ritualToClient,
  type RitualRow,
} from "@/lib/ritual-service";
import { getUserById } from "@/lib/users";
import { checkRitualAchievements } from "@/lib/achievements";

export type RitualGenerationOutcome =
  | { ok: true; status: "completed"; ritual: RitualRow; freshlyCompleted: boolean }
  | {
      ok: false;
      status: "failed";
      error: string;
      ritual: RitualRow | null;
      /** True only when a real paid charge was refunded. */
      refunded?: boolean;
    };

/** Refund only real paid spends; skip free/unlimited and pass txn id for idempotency. */
export async function failRitualGeneration(ritual: RitualRow, refundRequested = true): Promise<boolean> {
  return withTransaction(async (client) => {
    await queryClient(client, "SELECT id FROM users WHERE id=$1 FOR UPDATE", [ritual.user_id]);
    const claim = await queryClient(client, `SELECT id FROM rituals WHERE id=$1 AND user_id=$2
      AND status='generating' AND transaction_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE`,
      [ritual.id, ritual.user_id, ritual.transaction_id]);
    if (!claim.rowCount) return false;
    let refunded = false;
    if (refundRequested && ritual.payment_status === "paid" && ritual.transaction_id) {
      const spend = await queryClient<{ amount: number }>(client, `SELECT amount FROM rune_transactions
        WHERE id=$1 AND user_id=$2 AND type='spend' AND action_type='ritual' AND amount<0`,
        [ritual.transaction_id, ritual.user_id]);
      if (!spend.rows[0]) throw new Error("ritual_payment_receipt_missing");
      const rollback = await BillingService.rollbackChargeEx({
        userId: ritual.user_id,
        cost: -spend.rows[0].amount,
        wasFreeQuestion: false,
        actionType: "ritual",
        transactionId: ritual.transaction_id,
        client,
      });
      refunded = rollback.refunded;
    }
    await queryClient(client, `UPDATE rituals SET status='payment', payment_status='pending', updated_at=NOW()
      WHERE id=$1 AND user_id=$2 AND status='generating' AND transaction_id IS NOT DISTINCT FROM $3::uuid`,
      [ritual.id, ritual.user_id, ritual.transaction_id]);
    return refunded;
  });
}

export async function runRitualGenerationForUser(params: {
  ritualId: string;
  userId: string;
  rollbackOnFailure?: boolean;
  captureGeneration?: string | null;
}): Promise<RitualGenerationOutcome> {
  return withReadingLock(`ritual-generation:${params.userId}:${params.ritualId}`, () => runRitualGenerationLocked(params));
}

async function runRitualGenerationLocked(params: {
  ritualId: string; userId: string; rollbackOnFailure?: boolean; captureGeneration?: string | null;
}): Promise<RitualGenerationOutcome> {
  const ritual = await getRitualById(params.ritualId);
  if (!ritual || ritual.user_id !== params.userId) {
    return { ok: false, status: "failed", error: "not_found", ritual: null };
  }

  if (ritual.status === "completed" || ritual.status === "reviewed") {
    return { ok: true, status: "completed", ritual, freshlyCompleted: false };
  }

  // Paid but rolled back to payment after failed generation — allow re-pay flow.
  if (ritual.status === "payment") {
    return { ok: false, status: "failed", error: "needs_payment", ritual };
  }

  // Unlimited / billing-off paths set payment_status to "free" after pay.
  const paidOrFree =
    ritual.payment_status === "paid" || ritual.payment_status === "free";
  if (ritual.status !== "generating" || !paidOrFree) {
    return { ok: false, status: "failed", error: "invalid_status", ritual };
  }

  const captureGeneration = params.captureGeneration !== undefined ? params.captureGeneration : await captureMemoryGeneration(params.userId, ritual.created_at);
  const profile = await getUserById(params.userId);
  const userProfile = {
    name: profile?.name ?? "друг",
    zodiac: profile?.zodiac ?? "",
    gender: profile?.gender ?? null,
  };

  try {
    const memoryContext = await buildMemoryContext({
      userId: params.userId,
      characterId: ritual.character_key,
      product: "ritual",
      depth: "deep",
      profile: {
        name: userProfile.name,
        gender: userProfile.gender ?? undefined,
        zodiac: userProfile.zodiac,
      },
      lastUserMessage: [
        ritual.ritual_type,
        buildRitualAnswersMessage(ritual.ritual_type, ritual.answers),
      ].join("\n"),
      includePastSessions: true,
    }).catch((err) => {
      console.warn("Ritual memory context failed:", err);
      return undefined;
    });
    const result = await attemptRitualGeneration(
      params.ritualId,
      userProfile,
      memoryContext
    );
    if (result) {
      await captureRitualMemory({
        captureGeneration,
        userId: params.userId,
        ritualId: result.id,
        characterKey: result.character_key,
        ritualType: result.ritual_type,
        answers: result.answers,
        assistantSummary: [
          result.ritual_words,
          result.ritual_place,
          ...(result.ritual_steps ?? []).map((s) => s.step),
        ]
          .filter(Boolean)
          .join("\n"),
      });
      return { ok: true, status: "completed", ritual: result, freshlyCompleted: true };
    }

    const shouldRefund =
      params.rollbackOnFailure !== false && ritual.payment_status === "paid";
    const refunded = await failRitualGeneration(ritual, shouldRefund);
    const failed = await getRitualById(params.ritualId);
    console.error("Ritual generation failed for", params.ritualId);
    return {
      ok: false,
      status: "failed",
      error: "generation_failed",
      ritual: failed,
      refunded,
    };
  } catch (err) {
    const shouldRefund =
      params.rollbackOnFailure !== false && ritual.payment_status === "paid";
    const refunded = await failRitualGeneration(ritual, shouldRefund);
    console.error("Ritual generation error:", err);
    const failed = await getRitualById(params.ritualId);
    return {
      ok: false,
      status: "failed",
      error: "generation_error",
      ritual: failed,
      refunded,
    };
  }
}

export function ritualGenerationResponse(
  outcome: RitualGenerationOutcome,
  achievement?: Awaited<ReturnType<typeof checkRitualAchievements>>
) {
  return {
    ok: outcome.ok,
    status: outcome.status,
    error: outcome.ok ? undefined : outcome.error,
    ritual: outcome.ritual ? ritualToClient(outcome.ritual) : null,
    achievement: achievement ?? undefined,
    refunded: outcome.ok ? undefined : Boolean(outcome.refunded),
  };
}
