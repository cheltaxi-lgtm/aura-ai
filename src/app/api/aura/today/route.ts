import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { toAuraTeaserSnapshot } from "@/lib/aura-constants";
import { findTodaysPaidAuraReport } from "@/lib/aura-reading-persist";
import {
  findTodaysAuraSnapshotByClaimToken,
  findTodaysAuraSnapshotForUser,
} from "@/lib/services/aura-guest-service";
import { readAuraGuestClaimCookie } from "@/lib/aura-guest-claim-cookie";
import { isAuraOtherSubjectsEnabled, isAuraReadingEnabled } from "@/lib/settings";

export const runtime = "nodejs";

function emptyToday() {
  return NextResponse.json(
    {
      snapshot: null,
      snapshotId: null,
      paid: false,
      claimed: false,
      report: null,
      historyId: null,
      subjectId: null,
      subjectKind: null,
      subjectName: null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Today's aura without a new photo. Identity = account or guest claim cookie.
 * Guest gets the teaser subset; the paid report ships only to the owner.
 */
export async function GET(request: NextRequest) {
  if (!(await isAuraReadingEnabled())) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const authed = await requireUserAuth();
  const profileUserId = authed ? await getProfileUserIdForAccount(authed.sub) : null;

  const othersOn = await isAuraOtherSubjectsEnabled();
  const subjectParam = othersOn ? request.nextUrl.searchParams.get("subject") : null;
  const subjectId =
    subjectParam && /^[0-9a-f-]{36}$/i.test(subjectParam) ? subjectParam : null;

  if (profileUserId) {
    const [paid, stored] = await Promise.all([
      findTodaysPaidAuraReport(profileUserId, othersOn ? subjectId : undefined),
      findTodaysAuraSnapshotForUser(profileUserId, othersOn ? subjectId : undefined),
    ]);
    if (paid?.report) {
      const snapshot = paid.snapshot ?? stored?.snapshot ?? null;
      if (snapshot) {
        return NextResponse.json(
          {
            snapshot,
            snapshotId: paid.snapshotId ?? stored?.snapshotId ?? null,
            paid: true,
            claimed: true,
            report: paid.report,
            historyId: paid.historyId,
            subjectId: stored?.subjectId ?? null,
            subjectKind: stored?.subjectKind ?? null,
            subjectName: stored?.subjectName ?? null,
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }
    if (stored) {
      return NextResponse.json(
        {
          snapshot: toAuraTeaserSnapshot(stored.snapshot),
          snapshotId: stored.snapshotId,
          paid: false,
          claimed: true,
          report: null,
          historyId: null,
          subjectId: stored.subjectId,
          subjectKind: stored.subjectKind,
          subjectName: stored.subjectName,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  const claimToken = await readAuraGuestClaimCookie(request);
  const cookieStored = await findTodaysAuraSnapshotByClaimToken(claimToken);
  const cookieSafe =
    cookieStored &&
    (!cookieStored.claimedUserId || cookieStored.claimedUserId === profileUserId)
      ? cookieStored
      : null;
  if (!cookieSafe) return emptyToday();

  if (othersOn && profileUserId && subjectId) {
    if (cookieSafe.subjectId && cookieSafe.subjectId !== subjectId) {
      return emptyToday();
    }
  } else if (othersOn && profileUserId) {
    if (cookieSafe.subjectKind === "other") return emptyToday();
  }

  return NextResponse.json(
    {
      snapshot: toAuraTeaserSnapshot(cookieSafe.snapshot),
      snapshotId: cookieSafe.snapshotId,
      paid: false,
      claimed: Boolean(profileUserId && cookieSafe.claimedUserId === profileUserId),
      report: null,
      historyId: null,
      subjectId: cookieSafe.subjectId,
      subjectKind: cookieSafe.subjectKind,
      subjectName: cookieSafe.subjectName,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
