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
import { isAuraReadingEnabled } from "@/lib/settings";

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

  if (profileUserId) {
    const [paid, stored] = await Promise.all([
      findTodaysPaidAuraReport(profileUserId),
      findTodaysAuraSnapshotForUser(profileUserId),
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

  return NextResponse.json(
    {
      snapshot: toAuraTeaserSnapshot(cookieSafe.snapshot),
      snapshotId: cookieSafe.snapshotId,
      paid: false,
      claimed: Boolean(profileUserId && cookieSafe.claimedUserId === profileUserId),
      report: null,
      historyId: null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
