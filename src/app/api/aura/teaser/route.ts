import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { isAgeGateCookieConfirmed } from "@/lib/age-gate-cookie";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { getUserById } from "@/lib/users";
import {
  clientIp,
  MAX_IMAGE_BYTES,
  validateImageMime,
} from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isAuraReadingEnabled } from "@/lib/settings";
import { toAuraTeaserSnapshot, type AuraSnapshot } from "@/lib/aura-constants";
import { generateAuraSnapshot } from "@/lib/aura-reading-prompts";
import {
  createGuestAuraSnapshot,
  findAuraSnapshotByClaimToken,
  findScopedSnapshotByPhotoHash,
  findTodaysAuraSnapshotByClaimToken,
  findTodaysAuraSnapshotForUser,
  getAuraBaseColorAnchor,
  getLatestAuraSnapshotForUser,
  hashAuraPhoto,
  lockAuraCoreIfRecent,
  type AuraStoredSnapshot,
} from "@/lib/services/aura-guest-service";
import {
  readAuraGuestClaimCookie,
  setAuraGuestClaimCookieOnResponse,
} from "@/lib/aura-guest-claim-cookie";
import { reportError } from "@/lib/error-report";

export const runtime = "nodejs";
export const maxDuration = 90;

/** Guest Aura teaser: IP-bound (pre-auth acquisition, vision is not free). */
async function enforceAuraGuestTeaserRateLimit(
  ip: string
): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("aura_guest_teaser", ip),
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
    snapshot: AuraSnapshot;
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
    snapshot: toAuraTeaserSnapshot(opts.snapshot),
    reused: opts.reused,
    claimed: opts.claimed,
  });
  if (opts.rawClaimToken) {
    setAuraGuestClaimCookieOnResponse(response, opts.rawClaimToken, request);
  }
  return response;
}

function fromStored(
  request: NextRequest,
  stored: AuraStoredSnapshot,
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

/**
 * Pre-auth Aura: portrait → structured snapshot (colors/layers/chakras + teaser).
 * The original photo is NEVER persisted — only the structured result.
 * Issues an HttpOnly claim cookie for post-auth continuation.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!(await isAuraReadingEnabled())) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  // Age gate: authenticated callers are checked at the account/profile level
  // (same rule as /api/aura/report) — the guest cookie is per-browser and must
  // not block a logged-in, age-eligible user on a new device.
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

  const claimToken = await readAuraGuestClaimCookie(request);
  const todaysOwn = profileUserId
    ? await findTodaysAuraSnapshotForUser(profileUserId)
    : null;
  const todaysCookie = todaysOwn
    ? null
    : await findTodaysAuraSnapshotByClaimToken(claimToken);
  const todays =
    todaysOwn ??
    (todaysCookie &&
    (!todaysCookie.claimedUserId || todaysCookie.claimedUserId === profileUserId)
      ? todaysCookie
      : null);
  if (todays) {
    return fromStored(request, todays, "today", profileUserId);
  }

  const limited = await enforceAuraGuestTeaserRateLimit(clientIp(request));
  if (limited) return limited;

  let imageBase64 = "";
  let mimeType = "image/jpeg";

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const file = form.get("image");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Загрузите фото" }, { status: 400 });
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
      imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
      mimeType = typeof body.mimeType === "string" ? body.mimeType : mimeType;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  if (!imageBase64.trim()) {
    return NextResponse.json({ error: "Загрузите фото" }, { status: 400 });
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
        message: "Не удалось прочитать изображение. Загрузите JPG или PNG портрет.",
      },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  try {
    const photoHash = hashAuraPhoto(trimmed);
    const hashed = await findScopedSnapshotByPhotoHash({
      photoHash,
      profileUserId,
      claimToken,
    });
    if (hashed) {
      const hashSafe =
        !hashed.claimedUserId || hashed.claimedUserId === profileUserId;
      if (hashSafe) {
        console.info("[aura-teaser] reused-photo", {
          ms: Date.now() - startedAt,
          imageBytes: rawSize,
          dominant: hashed.snapshot.dominantColor.key,
        });
        return fromStored(request, hashed, "photo", profileUserId);
      }
    }

    const cookieStored = await findAuraSnapshotByClaimToken(claimToken);
    const cookieSafe =
      cookieStored &&
      (!cookieStored.claimedUserId || cookieStored.claimedUserId === profileUserId)
        ? cookieStored
        : null;
    const previous =
      (profileUserId ? await getLatestAuraSnapshotForUser(profileUserId) : null) ??
      cookieSafe;
    const anchor =
      (profileUserId ? await getAuraBaseColorAnchor(profileUserId) : null) ??
      (previous
        ? { color: previous.snapshot.dominantColor, createdAt: previous.createdAt }
        : null);

    const generated = await generateAuraSnapshot(trimmed, mimeType, {
      baseColor: anchor?.color ?? null,
      previous: previous?.snapshot ?? null,
    });
    if (!generated) {
      return NextResponse.json(
        {
          error: "NO_FACE",
          message:
            "Не видно лица крупным планом. Снимите портрет при ровном свете — лицо без очков и сильных теней.",
        },
        { status: 422 }
      );
    }

    const snapshot = lockAuraCoreIfRecent(generated, anchor);
    const { rawClaimToken, snapshotId, expiresAt } = await createGuestAuraSnapshot(
      snapshot,
      { photoHash }
    );

    console.info("[aura-teaser] ok", {
      ms: Date.now() - startedAt,
      imageBytes: rawSize,
      verdict: snapshot.verdict,
      dominant: snapshot.dominantColor.key,
      anchored: Boolean(anchor),
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
    if (msg === "AURA_DISABLED") {
      return NextResponse.json({ error: "disabled" }, { status: 404 });
    }
    console.error("[aura-teaser] failed", { ms: Date.now() - startedAt, error: msg });
    reportError(error, { route: "aura/teaser" });
    return NextResponse.json(
      {
        error: "VISION_UNAVAILABLE",
        message: "Сервис временно недоступен. Попробуйте через минуту.",
      },
      { status: 503 }
    );
  }
}
