import { NextRequest, NextResponse } from "next/server";
import { adsQuery } from "@/modules/ads/db";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  const { rows } = await adsQuery(
    `SELECT id, severity, code, message, payload_json,
            acknowledged_at, created_at
     FROM ads.alert
     ORDER BY acknowledged_at NULLS FIRST, created_at DESC
     LIMIT 200`
  );
  const unacked = rows.filter((r) => !r.acknowledged_at).length;
  return NextResponse.json({ items: rows, unacked });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: string;
  };
  if (body.action === "ack_all") {
    await adsQuery(
      `UPDATE ads.alert SET acknowledged_at = NOW() WHERE acknowledged_at IS NULL`
    );
    await writeAdsAdminAction({
      adminId: auth.sub,
      action: "alerts_ack_all",
      entityType: "ads_alert",
    });
    return NextResponse.json({ ok: true });
  }

  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  await adsQuery(
    `UPDATE ads.alert SET acknowledged_at = NOW()
     WHERE id = $1::uuid AND acknowledged_at IS NULL`,
    [body.id]
  );
  await writeAdsAdminAction({
    adminId: auth.sub,
    action: "alert_acknowledge",
    payload: { id: body.id },
    entityType: "ads_alert",
    entityId: body.id,
  });

  return NextResponse.json({ ok: true });
}
