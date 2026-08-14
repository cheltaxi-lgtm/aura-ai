import { BillingService } from "@/lib/services/billing-service";
import {
  buildRitualAnswersMessage,
  captureRitualMemory,
} from "@/lib/memory/capture-helpers";
import { buildMemoryContext } from "@/lib/memory/build-memory-context";
import {
  attemptRitualGeneration,
  getRitualById,
  markRitualGenerationFailed,
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
async function rollbackPaidRitual(ritual: RitualRow): Promise<void> {
  if (ritual.payment_status !== "paid") return;
  if (ritual.rune_cost <= 0) return;
  try {
    await BillingService.rollbackCharge({
      userId: ritual.user_id,
      cost: ritual.rune_cost,
      wasFreeQuestion: false,
      actionType: "ritual",
      transactionId: ritual.transaction_id ?? undefined,
    });
  } catch (err) {
    console.error("Ritual rune rollback failed:", err);
  }
}

export async function runRitualGenerationForUser(params: {
  ritualId: string;
  userId: string;
  rollbackOnFailure?: boolean;
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
      captureRitualMemory({
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
    await markRitualGenerationFailed(params.ritualId);
    if (shouldRefund) {
      await rollbackPaidRitual(ritual);
    }
    const failed = await getRitualById(params.ritualId);
    console.error("Ritual generation failed for", params.ritualId);
    return {
      ok: false,
      status: "failed",
      error: "generation_failed",
      ritual: failed,
      refunded: shouldRefund,
    };
  } catch (err) {
    const shouldRefund =
      params.rollbackOnFailure !== false && ritual.payment_status === "paid";
    await markRitualGenerationFailed(params.ritualId);
    if (shouldRefund) {
      await rollbackPaidRitual(ritual);
    }
    console.error("Ritual generation error:", err);
    const failed = await getRitualById(params.ritualId);
    return {
      ok: false,
      status: "failed",
      error: "generation_error",
      ritual: failed,
      refunded: shouldRefund,
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
