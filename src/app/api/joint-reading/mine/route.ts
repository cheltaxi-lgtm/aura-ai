import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { buildJointReadingUrl, listJointReadingsForUser } from "@/lib/joint-reading-service";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";
import { stripMarkdownText } from "@/lib/cabinet-utils";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";

export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimited = await enforcePaidRouteRateLimit(
    authed.profileUserId,
    "joint_reading_mine"
  );
  if (rateLimited) return rateLimited;

  const rows = await listJointReadingsForUser(authed.profileUserId);

  return NextResponse.json({
    items: rows.map((row) => {
      const isInitiator = row.initiator_user_id === authed.profileUserId;
      const ownReading = isInitiator ? row.initiator_reading : row.partner_reading;
      const combined = row.combined_reading?.trim() || null;
      const previewSource = combined || ownReading;
      const preview = previewSource
        ? stripMarkdownText(previewSource).replace(/\s+/g, " ").trim().slice(0, 320)
        : null;

      return {
        token: row.token,
        url: buildJointReadingUrl(row.token),
        status: row.status,
        intentTitle: getSpreadIntentBySlug(row.intent_slug)?.title ?? "Совместный расклад",
        initiatorName: row.initiator_name,
        partnerName: row.partner_name,
        hasInitiatorReading: Boolean(row.initiator_reading),
        hasPartnerReading: Boolean(row.partner_reading),
        hasCombined: Boolean(combined),
        preview,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        isInitiator,
      };
    }),
  });
}
