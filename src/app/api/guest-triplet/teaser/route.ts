import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { readGuestResumeCookie } from "@/lib/guest-resume-cookie";
import {
  expireIssuedGuestResumeIfNeeded,
  findGuestResumeByTokenHash,
} from "@/lib/guest-triplet-receipt-db";
import {
  hashGuestResumeToken,
  parseGuestResumeCardsPayload,
} from "@/lib/guest-triplet-receipt";
import { resolveGuestTeaser } from "@/lib/guest-triplet-teaser-service";

export const runtime = "nodejs";

/**
 * POST /api/guest-triplet/teaser
 * Idempotent short reading for an issued guest receipt.
 * Never blocks complete; never regenerates cards.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const token = await readGuestResumeCookie(request);
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tokenHash = hashGuestResumeToken(token);
  let row = await findGuestResumeByTokenHash(tokenHash);
  if (!row) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  row = await expireIssuedGuestResumeIfNeeded(row);
  if (
    row.guest_resume_status !== "issued" &&
    row.guest_resume_status !== "claimed"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const payload = parseGuestResumeCardsPayload(row.cards);
  if (!payload) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const result = await resolveGuestTeaser({ request, row, payload });

  return NextResponse.json({
    ok: true,
    text: result.text,
    isFallback: result.isFallback,
    source: result.source,
    promptVersion: result.promptVersion ?? null,
    model: result.model ?? null,
  });
}
