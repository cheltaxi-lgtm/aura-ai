import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { createHash } from "node:crypto";
import { sceneImageResourceIdentity } from "@/lib/scene-image-identity";
import { withReadingLock } from "@/lib/reading-lock";
import { enforceImageGenRateLimit } from "@/lib/api-guards";
import { generateSceneImage, isImageGenConfigured } from "@/lib/image-gen";
import type { ImageGenerateRequest, ImageSceneType } from "@/lib/image-prompts";
import { sceneLabel } from "@/lib/image-prompts";
import { zodiacSignArtUrl } from "@/utils/zodiac";
import { getSetting } from "@/lib/settings";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import { spreadCardsKey } from "@/lib/spreads";
import { findExistingSceneArtUrl } from "@/lib/users";
import { saveHistoryProductReceipt } from "@/lib/services/history-product-receipt";
import { recoverSavedWorkerReport } from "@/lib/services/durable-report-receipt";
import { normalizeSceneImageUrl } from "@/lib/scene-image-store";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  BillingIdempotencyConflictError,
  billingIdempotencyConflictResponse,
  buildFallbackChargeIdempotencyKey,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { isRuneBillingActive } from "@/lib/rune-service";
import type { RuneActionType } from "@/lib/rune-costs";
import {
  getAsyncJobWorkerUserId,
  getReportWorkerJobFromRequest,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
  chargeRuneActionForWorkerJob,
  refundWorkerJobCharge,
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
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) throw new Error("invalid_body");
    for (const field of ["scene", "characterKey", "userName", "zodiac", "spreadId", "userQuestionText", "aiResponseText"]) {
      if (rawBody[field] !== undefined && typeof rawBody[field] !== "string") throw new Error("invalid_field");
    }
    if (rawBody.cards !== undefined && (!Array.isArray(rawBody.cards) || rawBody.cards.length > 32 ||
        rawBody.cards.some(card => typeof card !== "string" || card.length > 300))) throw new Error("invalid_cards");
    body = rawBody as unknown as ImageGenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const asyncRequested = rawBody.async === true;

  const scene = String(body.scene ?? "");
  if (!isSceneType(scene)) {
    return NextResponse.json({ error: "Invalid scene type" }, { status: 400 });
  }

  // Paid AI scene art is retained for a possible future rollout, but requires
  // an explicit server flag in addition to persisted admin settings. This gate
  // runs before async enqueue and before any rune charge.
  if (scene !== "zodiac_avatar" && process.env.SCENE_IMAGE_GENERATION_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Scene image generation disabled", code: "scene_off" },
      { status: 403 }
    );
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
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile required", code: "profile_required" }, { status: 409 });
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

  if (scene === "final_report" && !unlimited && !useRuneBilling) {
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

  const resourceIdentity = sceneImageResourceIdentity(body, visual.stylePrefix);
  return withReadingLock(`image:${profileUserId ?? accountId}:${resourceIdentity}`, async () => {
  let artifactSaved = false;
  let billingCharge: BillingChargeResult | null = null;
  let runeBalance: number | undefined;

  try {
    const cardsKey = spreadCardsKey(
      body.cards?.map(String),
      body.spreadId,
      "new"
    );
    if (profileUserId && workerUserId) {
      const recovered = await recoverSavedWorkerReport(profileUserId, getReportWorkerJobFromRequest(request));
      if (recovered) return NextResponse.json({ ...recovered, reused: true });
    }

    if (profileUserId) {
      const existingUrl = await findExistingSceneArtUrl(profileUserId, scene, cardsKey, { resourceIdentity });
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

    if (profileUserId && (useRuneBilling || workerUserId) && runeAction) {
      try {
        const charge = workerUserId ? await chargeRuneActionForWorkerJob({
          request, userId: profileUserId, action: runeAction, operationIdentity: resourceIdentity,
          legacyPurchase: { idempotencyKey: `image:${createHash("sha256").update(resourceIdentity).digest("hex").slice(0, 40)}`, operationIdentity: resourceIdentity },
        }) : await BillingService.chargeRuneAction({
          userId: profileUserId,
          action: runeAction,
          idempotencyKey: `image:${createHash("sha256").update(resourceIdentity).digest("hex").slice(0, 40)}`,
          operationIdentity: resourceIdentity,
          legacyIdempotencyKeys: [buildFallbackChargeIdempotencyKey({
            userId: profileUserId, actionType: runeAction, cost: runeCostFromSettings(runeSettings, runeAction),
          })],
        });
        billingCharge = charge;
        runeBalance = charge.newBalance;
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          return insufficientFundsResponse(err);
        }
        if (err instanceof BillingIdempotencyConflictError) return billingIdempotencyConflictResponse();
        throw err;
      }
    }

    const result = await generateSceneImage({ ...body, scene });
    if (!result) {
      let actuallyRefunded = false;
      if (profileUserId && billingCharge && !artifactSaved) {
        try {
          const refund = await refundWorkerJobCharge(request, {
            userId: profileUserId,
            cost: billingCharge.spentRunes,
            wasFreeQuestion: billingCharge.wasFreeQuestion,
            actionType: billingCharge.actionType,
            transactionId: billingCharge.transactionId,
          });
          runeBalance = refund.balance; actuallyRefunded = refund.refunded;
        } catch (refundErr) {
          console.error("Scene art refund failed:", refundErr);
          const { reportError } = await import("@/lib/error-report");
          reportError(refundErr, { route: "image/generate", stage: "refund" });
        }
      }
      await trackWorkerJobFailed(request, "Image generation failed", {
        refunded: actuallyRefunded,
        errorCode: "generation_failed",
      });
      return NextResponse.json({ error: "Image generation failed", code: "generation_failed" }, { status: 502 });
    }

    if (profileUserId) {
      const storableUrl = await normalizeSceneImageUrl(result.imageUrl);
      const payload = { imageUrl: storableUrl, scene: result.scene, sceneLabel: sceneLabel(result.scene),
        model: result.model, aspectRatio: result.aspectRatio, quality: result.quality, runeBalance };
      await saveHistoryProductReceipt({ request, transactionId: billingCharge?.transactionId, result: payload, history: {
        userId: profileUserId,
        characterName: body.characterKey ? String(body.characterKey) : "scene-image",
        contextData: {
          type: "scene_image", sceneImageResourceKey: resourceIdentity,
          sceneArt: { [scene]: storableUrl }, scene,
          tarotCards: body.cards?.map(name => ({ name })) ?? [],
          characterKey: body.characterKey, userName: body.userName, zodiac: body.zodiac,
          spreadId: body.spreadId, question: body.userQuestionText,
          sourceAnswer: body.aiResponseText,
          transactionId: billingCharge?.transactionId ?? null,
        },
        isPaid: Boolean(billingCharge) || unlimited,
      } });
      artifactSaved = true;
      result.imageUrl = storableUrl;
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
    let actuallyRefunded = false;
    if (profileUserId && billingCharge && !artifactSaved) {
      try {
        const refund = await refundWorkerJobCharge(request, {
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: billingCharge.wasFreeQuestion,
          actionType: billingCharge.actionType,
            transactionId: billingCharge.transactionId,
        });
        actuallyRefunded = refund.refunded;
      } catch (refundErr) {
        console.error("Scene art refund failed:", refundErr);
        reportError(refundErr, { route: "image/generate", stage: "refund" });
      }
    }
    await trackWorkerJobFailed(request, "Image generation error", {
      refunded: actuallyRefunded,
      errorCode: "generation_failed",
    });
    return NextResponse.json({ error: "Image generation error" }, { status: 500 });
  }
  });
}
