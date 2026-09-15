import { NextRequest, NextResponse } from "next/server";

import { clientIp, enforceGuestTripletStatusRateLimit } from "@/lib/api-guards";
import { getAuth } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import {
  resolvePendingGuestResume,
  serializePendingGuestResume,
} from "@/lib/guest-triplet-pending";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

/** Restore the safe UI summary when localStorage was cleared; secrets stay HttpOnly. */
export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }

  const auth = await getAuth();
  if (auth?.role === "user") {
    return NextResponse.json({ ok: true, status: "none" }, { headers: NO_STORE });
  }

  const limited = await enforceGuestTripletStatusRateLimit(clientIp(request));
  if (limited) {
    limited.headers.set("Cache-Control", "no-store");
    return limited;
  }

  try {
    const pending = await resolvePendingGuestResume(request);
    if (!pending) {
      return NextResponse.json({ ok: true, status: "none" }, { headers: NO_STORE });
    }
    return NextResponse.json({
      ok: true,
      status: "issued",
      ...serializePendingGuestResume(pending),
    }, { headers: NO_STORE });
  } catch (error) {
    console.warn(
      "[guest-triplet/pending] lookup failed",
      error instanceof Error ? error.message : "error"
    );
    return NextResponse.json({ error: "unavailable" }, { status: 500, headers: NO_STORE });
  }
}
