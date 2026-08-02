import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { enforceImageGenRateLimit } from "@/lib/api-guards";
import { generateSceneImage, isImageGenConfigured } from "@/lib/image-gen";
import type { ImageGenerateRequest, ImageSceneType } from "@/lib/image-prompts";
import { sceneLabel } from "@/lib/image-prompts";
import { zodiacSignArtUrl } from "@/utils/zodiac";
import { getSetting } from "@/lib/settings";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import { spreadCardsKey } from "@/lib/spreads";
import { persistSceneArtForSpread, findExistingSceneArtUrl } from "@/lib/users";
import { normalizeSceneImageUrl } from "@/lib/scene-image-store";
import { getRuneSettings } from "@/lib/rune-settings";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { isRuneBillingActive } from "@/lib/rune-service";
import type { RuneActionType } from "@/lib/rune-costs";
import {
  getAsyncJobWorkerUserId,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
} from "@/lib/async-job-lifecycle";

export const maxDuration = 120;

const SCENES: ImageSceneType[] = [
  "zodiac_avatar",
  "tarot_atmosphere",
  "destiny_card",
  "scene_illustration",
  "final_report",
];

const SCENE_RUNE_ACTION: Partial<Record<ImageSceneType, RuneActionType>> = {
  destiny_card: "DESTINY_CARD",
  final_report: "FINAL_REPORT",
  scene_illustration: "SCENE_ILLUSTRATION",
  tarot_atmosphere: "TAROT_ATMOSPHERE",
};

function isSceneType(value: string): value is ImageSceneType {
  return SCENES.includes(value as ImageSceneType);
}

export async function POST(request: NextRequest) {
  const workerUserId = getAsyncJobWorkerUserId(request);
  let accountId: string;
  let profileUserId: string | null;

  if (workerUserId) {
    accountId = workerUserId;
    profileUserId = workerUserId;
  } else {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized", code: "auth_required" }, { status: 401 });
    }
    accountId = auth.sub;
    profileUserId = await getProfileUserIdForAccount(auth.sub);
    const rateLimited = await enforceImageGenRateLimit(auth.sub);
    if (rateLimited) return rateLimited;
  }

  const visual = await getSetting("visual");
  if (!visual.enabled) {
    return NextResponse.json({ error: "Image generation disabled", code: "disabled" }, { status: 503 });
  }

  if (!isImageGenConfigured()) {
    return NextResponse.json(
      { error: "Image generation not configured", code: "not_configured" },
      { status: 503 }
    );
  }

  let body: ImageGenerateRequest;
  let rawBody: Record<string, unknown> = {};
  try {
    rawBody = await request.json();
    body = rawBody as unknown as ImageGenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const asyncRequested = rawBody.async === true;

  const scene = String(body.scene ?? "");
  if (!isSceneType(scene)) {
    return NextResponse.json({ error: "Invalid scene type" }, { status: 400 });
  }

  // Zodiac spirit = static deck art only. Never call the image model (token burn).
  if (scene === "zodiac_avatar") {
    if (!body.zodiac?.trim()) {
      return NextResponse.json({ error: "zodiac required for zodiac_avatar" }, { status: 400 });
    }
    const staticUrl = zodiacSignArtUrl(body.zodiac);
    if (!staticUrl) {
      return NextResponse.json({ error: "unknown_zodiac" }, { status: 400 });
    }
    return NextResponse.json({
      imageUrl: staticUrl,
      scene,
      sceneLabel: sceneLabel(scene),
      reused: true,
      static: true,
    });
  }

  if (!visual.scenes[scene]) {
    return NextResponse.json({ error: "Scene disabled in admin settings", code: "scene_off" }, { status: 403 });
  }

  if (scene === "scene_illustration" && !body.aiResponseText?.trim()) {
    return NextResponse.json({ error: "aiResponseText required for scene_illustration" }, { status: 400 });
  }

  const runeSettings = await getRuneSettings();
  const unlimited = await resolveUnlimitedAccess({
    accountId,
    profileUserId: profileUserId ?? undefined,
  });
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);
  const runeAction = SCENE_RUNE_ACTION[scene as ImageSceneType];

  if (scene === "final_report" && !body.isPaid && !useRuneBilling) {
    return NextResponse.json(
      { error: "Final report requires paid access", code: "payment_required" },
      { status: 402 }
    );
  }

  if (asyncRequested && isAsyncJobWorkerConfigured() && !workerUserId) {
    if (!profileUserId) {
      return NextResponse.json({ error: "Profile required", code: "auth_required" }, { status: 401 });
    }
    return enqueuePaidAsyncJob({
      userId: profileUserId,
      kind: "image_generate",
      payload: {
        ...rawBody,
        async: false,
        cardsKey: spreadCardsKey(body.cards?.map(String), body.spreadId, "new"),
      },
      bypassDeliveryGate: true,
    });
  }

  let billingCharge: BillingChargeResult | null = null;
  let runeBalance: number | undefined;

  try {
    const cardsKey = spreadCardsKey(
      body.cards?.map(String),
      body.spreadId,
      "new"
    );

    if (profileUserId && scene !== "scene_illustration") {
      const existingUrl = await findExistingSceneArtUrl(profileUserId, scene, cardsKey);
      if (existingUrl) {
        const payload = {
          imageUrl: existingUrl,
          scene,
          sceneLabel: sceneLabel(scene),
          reused: true,
        };
        await trackWorkerJobCompleted(request, payload);
        return NextResponse.json(payload);
      }
    }

    if (profileUserId && useRuneBilling && runeAction) {
      try {
        const charge = await BillingService.chargeRuneAction({
          userId: profileUserId,
          action: runeAction,
        });
        billingCharge = charge;
        runeBalance = charge.newBalance;
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          return insufficientFundsResponse(err);
        }
        throw err;
      }
    }

    const result = await generateSceneImage({ ...body, scene });
    if (!result) {
      if (profileUserId && billingCharge) {
        try {
          runeBalance = await BillingService.rollbackCharge({
            userId: profileUserId,
            cost: billingCharge.spentRunes,
            wasFreeQuestion: billingCharge.wasFreeQuestion,
            actionType: billingCharge.actionType,
          });
        } catch (refundErr) {
          console.error("Scene art refund failed:", refundErr);
          const { reportError } = await import("@/lib/error-report");
          reportError(refundErr, { route: "image/generate", stage: "refund" });
        }
      }
      await trackWorkerJobFailed(request, "Image generation failed", {
        refunded: Boolean(billingCharge),
        errorCode: "generation_failed",
      });
      return NextResponse.json({ error: "Image generation failed", code: "generation_failed" }, { status: 502 });
    }

    if (profileUserId && scene !== "scene_illustration") {
      try {
        const storableUrl = await normalizeSceneImageUrl(result.imageUrl);
        const patched = await persistSceneArtForSpread(profileUserId, scene, storableUrl, {
          cardsKey,
          characterId: body.characterKey ? String(body.characterKey) : undefined,
        });
        void patched;
        result.imageUrl = storableUrl;
      } catch (err) {
        console.warn("Scene art history save failed:", err);
      }
    }

    const payload = {
      imageUrl: result.imageUrl,
      scene: result.scene,
      sceneLabel: sceneLabel(result.scene),
      model: result.model,
      aspectRatio: result.aspectRatio,
      quality: result.quality,
      runeBalance,
    };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Image generate error:", error);
    const { reportError } = await import("@/lib/error-report");
    reportError(error, { route: "image/generate", scene });
    if (profileUserId && billingCharge) {
      try {
        await BillingService.rollbackCharge({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: billingCharge.wasFreeQuestion,
          actionType: billingCharge.actionType,
        });
      } catch (refundErr) {
        console.error("Scene art refund failed:", refundErr);
        reportError(refundErr, { route: "image/generate", stage: "refund" });
      }
    }
    await trackWorkerJobFailed(request, "Image generation error", {
      refunded: Boolean(billingCharge),
      errorCode: "generation_failed",
    });
    return NextResponse.json({ error: "Image generation error" }, { status: 500 });
  }
}
