import { BillingService } from "@/lib/services/billing-service";
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
  | { ok: false; status: "failed"; error: string; ritual: RitualRow | null };

async function rollbackPaidRitual(userId: string, cost: number): Promise<void> {
  if (cost <= 0) return;
  try {
    await BillingService.rollbackCharge({
      userId,
      cost,
      wasFreeQuestion: false,
      actionType: "ritual",
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

  if (ritual.status !== "generating" || ritual.payment_status !== "paid") {
    return { ok: false, status: "failed", error: "invalid_status", ritual };
  }

  const profile = await getUserById(params.userId);
  const userProfile = {
    name: profile?.name ?? "друг",
    zodiac: profile?.zodiac ?? "",
  };

  try {
    const result = await attemptRitualGeneration(params.ritualId, userProfile);
    if (result) {
      return { ok: true, status: "completed", ritual: result, freshlyCompleted: true };
    }

    await markRitualGenerationFailed(params.ritualId);
    if (params.rollbackOnFailure !== false) {
      await rollbackPaidRitual(params.userId, ritual.rune_cost);
    }
    const failed = await getRitualById(params.ritualId);
    console.error("Ritual generation failed for", params.ritualId);
    return {
      ok: false,
      status: "failed",
      error: "generation_failed",
      ritual: failed,
    };
  } catch (err) {
    await markRitualGenerationFailed(params.ritualId);
    if (params.rollbackOnFailure !== false) {
      await rollbackPaidRitual(params.userId, ritual.rune_cost);
    }
    console.error("Ritual generation error:", err);
    const failed = await getRitualById(params.ritualId);
    return {
      ok: false,
      status: "failed",
      error: "generation_error",
      ritual: failed,
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
  };
}
