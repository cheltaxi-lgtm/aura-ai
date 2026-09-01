import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { isAgeGateCookieConfirmed } from "@/lib/age-gate-cookie";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { getUserById } from "@/lib/users";
import { clientIp, MAX_IMAGE_BYTES, validateImageMime } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isPalmReadingEnabled } from "@/lib/settings";
import {
  toPalmTeaserSnapshot,
  type PalmHand,
  type PalmSnapshot,
} from "@/lib/palm-constants";
import { generatePalmSnapshot } from "@/lib/palm-reading-prompts";
import {
  createGuestPalmSnapshot,
  findPalmSnapshotByClaimToken,
  findScopedPalmSnapshotByPhotoHash,
  findTodaysPalmSnapshotByClaimToken,
  findTodaysPalmSnapshotForUser,
  getLatestPalmSnapshotForUser,
  getPalmCoreAnchor,
  hashPalmPhoto,
  lockPalmCoreIfRecent,
  type PalmStoredSnapshot,
} from "@/lib/services/palm-guest-service";
import {
  readPalmGuestClaimCookie,
  setPalmGuestClaimCookieOnResponse,
} from "@/lib/palm-guest-claim-cookie";
import { reportError } from "@/lib/error-report";

export const runtime = "nodejs";
export const maxDuration = 90;

async function enforcePalmGuestTeaserRateLimit(ip: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("palm_guest_teaser", ip),
    6,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 3600) } }
    );
  }
  return null;
}

function teaserJson(
  request: NextRequest,
  opts: {
    snapshot: PalmSnapshot;
    snapshotId: string;
    expiresAt?: string | null;
    rawClaimToken?: string | null;
    reused: "today" | "photo" | null;
    claimed: boolean;
  }
) {
  const response = NextResponse.json({
    ok: true,
    snapshotId: opts.snapshotId,
    expiresAt: opts.expiresAt ?? null,
    snapshot: toPalmTeaserSnapshot(opts.snapshot),
    reused: opts.reused,
    claimed: opts.claimed,
  });
  if (opts.rawClaimToken) {
    setPalmGuestClaimCookieOnResponse(response, opts.rawClaimToken, request);
  }
  return response;
}

function fromStored(
  request: NextRequest,
  stored: PalmStoredSnapshot,
  reused: "today" | "photo",
  profileUserId: string | null
) {
  return teaserJson(request, {
    snapshot: stored.snapshot,
    snapshotId: stored.snapshotId,
    expiresAt: stored.expiresAt,
    reused,
    claimed: Boolean(profileUserId && stored.claimedUserId === profileUserId),
  });
}

function parseWhichHand(source: {
  get?: (key: string) => FormDataEntryValue | null;
  whichHand?: unknown;
}): PalmHand {
  const raw =
    typeof source.get === "function"
      ? String(source.get("whichHand") ?? "")
      : typeof source.whichHand === "string"
        ? source.whichHand
        : "";
  return raw.trim().toLowerCase() === "left" ? "left" : "right";
}

/**
 * Pre-auth palm: photo → structured snapshot (hand type + teaser).
 * The original photo is NEVER persisted — only the structured result.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!(await isPalmReadingEnabled())) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  const authed = await requireUserAuth();
  let profileUserId: string | null = null;
  if (authed) {
    profileUserId = await getProfileUserIdForAccount(authed.sub);
    const profileRow = profileUserId ? await getUserById(profileUserId) : null;
    if (!profileRow || !isUserAgeEligible(profileRow)) {
      return NextResponse.json(
        { error: AGE_REQUIRED_ERROR.error, code: AGE_REQUIRED_ERROR.code },
        { status: 403 }
      );
    }
  } else if (!(await isAgeGateCookieConfirmed(request))) {
    return NextResponse.json(
      { error: AGE_REQUIRED_ERROR.error, code: AGE_REQUIRED_ERROR.code },
      { status: 403 }
    );
  }

  const claimToken = await readPalmGuestClaimCookie(request);

  let imageBase64 = "";
  let mimeType = "image/jpeg";
  let whichHand: PalmHand = "right";

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      whichHand = parseWhichHand(form);
      const file = form.get("image");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Загрузите фото ладони" }, { status: 400 });
      }
      const uploadFile = file as File;
      const buf = Buffer.from(await uploadFile.arrayBuffer());
      imageBase64 = buf.toString("base64");
      mimeType = uploadFile.type || mimeType;
    } catch {
      return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
    }
  } else {
    try {
      const body = await request.json();
      whichHand = parseWhichHand(body as Record<string, unknown>);
      imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
      mimeType = typeof body.mimeType === "string" ? body.mimeType : mimeType;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const todaysOwn = profileUserId ? await findTodaysPalmSnapshotForUser(profileUserId) : null;
  const todaysCookie = todaysOwn ? null : await findTodaysPalmSnapshotByClaimToken(claimToken);
  const todays =
    todaysOwn ??
    (todaysCookie &&
    (!todaysCookie.claimedUserId || todaysCookie.claimedUserId === profileUserId)
      ? todaysCookie
      : null);
  if (todays) {
    return fromStored(request, todays, "today", profileUserId);
  }

  const limited = await enforcePalmGuestTeaserRateLimit(clientIp(request));
  if (limited) return limited;

  if (!imageBase64.trim()) {
    return NextResponse.json({ error: "Загрузите фото ладони" }, { status: 400 });
  }

  const rawSize = Math.ceil((imageBase64.length * 3) / 4);
  if (rawSize > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Фото слишком большое (макс. 5 МБ)" }, { status: 400 });
  }

  const mimeErr = validateImageMime(mimeType);
  if (mimeErr) return mimeErr;
  const trimmed = imageBase64.replace(/^data:image\/\w+;base64,/, "").trim();
  const head = trimmed.slice(0, 16);
  const magicOk =
    head.startsWith("/9j/") || head.startsWith("iVBORw0KG") || head.startsWith("UklGR");
  if (!magicOk) {
    return NextResponse.json(
      {
        error: "invalid_image_format",
        message: "Не удалось прочитать изображение. Загрузите JPG или PNG ладони.",
      },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  try {
    const photoHash = hashPalmPhoto(trimmed);
    const hashed = await findScopedPalmSnapshotByPhotoHash({
      photoHash,
      profileUserId,
      claimToken,
    });
    if (hashed) {
      const hashSafe = !hashed.claimedUserId || hashed.claimedUserId === profileUserId;
      if (hashSafe) {
        return fromStored(request, hashed, "photo", profileUserId);
      }
    }

    const cookieStored = await findPalmSnapshotByClaimToken(claimToken);
    const cookieSafe =
      cookieStored &&
      (!cookieStored.claimedUserId || cookieStored.claimedUserId === profileUserId)
        ? cookieStored
        : null;
    const previous =
      (profileUserId ? await getLatestPalmSnapshotForUser(profileUserId) : null) ?? cookieSafe;
    const anchor =
      (profileUserId ? await getPalmCoreAnchor(profileUserId) : null) ??
      (previous
        ? { handShape: previous.snapshot.handShape, createdAt: previous.createdAt }
        : null);

    const generated = await generatePalmSnapshot(trimmed, mimeType, {
      declaredHand: whichHand,
      previous: previous?.snapshot ?? null,
    });
    if (!generated) {
      return NextResponse.json(
        {
          error: "NO_HAND",
          message:
            "Не видно раскрытой ладони. Снимите ладонь пальцами вверх при ровном свете, без сильных теней.",
        },
        { status: 422 }
      );
    }

    const snapshot = lockPalmCoreIfRecent(generated, anchor);
    const { rawClaimToken, snapshotId, expiresAt } = await createGuestPalmSnapshot(snapshot, {
      photoHash,
    });

    return teaserJson(request, {
      snapshot,
      snapshotId,
      expiresAt,
      rawClaimToken,
      reused: null,
      claimed: false,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "error";
    if (msg === "PALM_DISABLED") {
      return NextResponse.json({ error: "disabled" }, { status: 404 });
    }
    console.error("[palm-teaser] failed", { ms: Date.now() - startedAt, error: msg });
    reportError(error, { route: "palm/teaser" });
    return NextResponse.json(
      {
        error: "VISION_UNAVAILABLE",
        message: "Сервис временно недоступен. Попробуйте через минуту.",
      },
      { status: 503 }
    );
  }
}
