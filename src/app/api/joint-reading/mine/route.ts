import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { buildJointReadingUrl, listJointReadingsForUser } from "@/lib/joint-reading-service";

export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await listJointReadingsForUser(authed.profileUserId);

  return NextResponse.json({
    items: rows.map((row) => ({
      token: row.token,
      url: buildJointReadingUrl(row.token),
      status: row.status,
      initiatorName: row.initiator_name,
      partnerName: row.partner_name,
      hasInitiatorReading: Boolean(row.initiator_reading),
      hasPartnerReading: Boolean(row.partner_reading),
      hasCombined: Boolean(row.combined_reading),
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      isInitiator: row.initiator_user_id === authed.profileUserId,
    })),
  });
}
