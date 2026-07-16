import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { enforceImageGenRateLimit } from "@/lib/api-guards";
import { generateSceneImage, isImageGenConfigured } from "@/lib/image-gen";
import type { ImageGenerateRequest, ImageSceneType } from "@/lib/image-prompts";
import { sceneLabel } from "@/lib/image-prompts";
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
import { insufficientRunesResponse } from "@/lib/insufficient-runes";
import type { RuneActionType } from "@/lib/rune-costs";
import {
  completeAsyncJob,
  createAsyncJob,
  failAsyncJob,
  markAsyncJobRunning,
} from "@/lib/async-jobs";
import { ensureDb } from "@/lib/db";

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
};

function isSceneType(value: string): value is ImageSceneType {
  return SCENES.includes(value as ImageSceneType);
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforceImageGenRateLimit(auth.sub);
  if (rateLimited) return rateLimited;

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

  if (!visual.scenes[scene]) {
    return NextResponse.json({ error: "Scene disabled in admin settings", code: "scene_off" }, { status: 403 });
  }

  if (scene === "scene_illustration" && !body.aiResponseText?.trim()) {
    return NextResponse.json({ error: "aiResponseText required for scene_illustration" }, { status: 400 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  const runeSettings = await getRuneSettings();
  const unlimited = await resolveUnlimitedAccess({
    accountId: auth.sub,
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

  if (asyncRequested) {
    if (!profileUserId) {
      return NextResponse.json({ error: "Profile required", code: "auth_required" }, { status: 401 });
    }
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
    }
    const jobPayload = { ...rawBody, async: false };
    const jobId = await createAsyncJob({
      userId: profileUserId,
      kind: "image_generate",
      payload: jobPayload,
    });
    after(async () => {
      await markAsyncJobRunning(jobId);
      try {
        const innerReq = new NextRequest(request.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: request.headers.get("cookie") ?? "",
          },
          body: JSON.stringify(jobPayload),
        });
        const res = await POST(innerReq);
        const data = (await res.json()) as Record<string, unknown> & { error?: string };
        if (!res.ok) {
          await failAsyncJob(jobId, data.error ?? `HTTP ${res.status}`);
          return;
        }
        await completeAsyncJob(jobId, data);
      } catch (err) {
        await failAsyncJob(jobId, err instanceof Error ? err.message : "image job failed");
      }
    });
    return NextResponse.json(
      { jobId, status: "pending", pollUrl: `/api/jobs/${jobId}` },
      { status: 202 }
    );
  }

  if (scene === "zodiac_avatar" && !body.zodiac?.trim()) {
    return NextResponse.json({ error: "zodiac required for zodiac_avatar" }, { status: 400 });
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
        return NextResponse.json({
          imageUrl: existingUrl,
          scene,
          sceneLabel: sceneLabel(scene),
          reused: true,
        });
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
        }
      }
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

    return NextResponse.json({
      imageUrl: result.imageUrl,
      scene: result.scene,
      sceneLabel: sceneLabel(result.scene),
      model: result.model,
      aspectRatio: result.aspectRatio,
      quality: result.quality,
      runeBalance,
    });
  } catch (error) {
    console.error("Image generate error:", error);
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
      }
    }
    return NextResponse.json({ error: "Image generation error" }, { status: 500 });
  }
}
