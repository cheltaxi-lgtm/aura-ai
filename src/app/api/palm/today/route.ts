import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { toPalmTeaserSnapshot } from "@/lib/palm-constants";
import { findTodaysPaidPalmReport } from "@/lib/palm-reading-persist";
import {
  findTodaysPalmSnapshotByClaimToken,
  findTodaysPalmSnapshotForUser,
} from "@/lib/services/palm-guest-service";
import { readPalmGuestClaimCookie } from "@/lib/palm-guest-claim-cookie";
import { isPalmReadingEnabled } from "@/lib/settings";

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

export async function GET(request: NextRequest) {
  if (!(await isPalmReadingEnabled())) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const authed = await requireUserAuth();
  const profileUserId = authed ? await getProfileUserIdForAccount(authed.sub) : null;

  if (profileUserId) {
    const [paid, stored] = await Promise.all([
      findTodaysPaidPalmReport(profileUserId),
      findTodaysPalmSnapshotForUser(profileUserId),
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
          snapshot: toPalmTeaserSnapshot(stored.snapshot),
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

  const claimToken = await readPalmGuestClaimCookie(request);
  const cookieStored = await findTodaysPalmSnapshotByClaimToken(claimToken);
  const cookieSafe =
    cookieStored &&
    (!cookieStored.claimedUserId || cookieStored.claimedUserId === profileUserId)
      ? cookieStored
      : null;
  if (!cookieSafe) return emptyToday();

  return NextResponse.json(
    {
      snapshot: toPalmTeaserSnapshot(cookieSafe.snapshot),
      snapshotId: cookieSafe.snapshotId,
      paid: false,
      claimed: Boolean(profileUserId && cookieSafe.claimedUserId === profileUserId),
      report: null,
      historyId: null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
