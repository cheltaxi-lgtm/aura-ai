import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { recordProductActivity } from "@/lib/product-activity";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = new Set(["too_general", "cards_wrong", "did_not_answer", "too_long", "technical", "other"]);

export async function POST(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "reading_feedback");
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const targetType = body.targetType === "reading" ? "reading" : "session";
  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  const useful = body.useful;
  const reason = typeof body.reason === "string" && REASONS.has(body.reason) ? body.reason : null;
  if (!UUID.test(targetId) || typeof useful !== "boolean" || (!useful && !reason)) {
    return NextResponse.json({ error: "invalid_feedback" }, { status: 400 });
  }

  const owns = targetType === "session"
    ? await query(`SELECT 1 FROM sessions s WHERE s.id=$1 AND s.user_id=$2 AND EXISTS (
        SELECT 1 FROM chat_messages m WHERE m.session_id=s.id AND m.role='assistant' AND length(trim(m.content))>0
      ) LIMIT 1`, [targetId, auth.profileUserId])
    : await query(`SELECT 1 FROM history h WHERE h.id=$1 AND h.user_id=$2 LIMIT 1`, [targetId, auth.profileUserId]);
  if (!owns.rowCount) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const product = typeof body.product === "string" && /^[a-z_]{1,32}$/.test(body.product)
    ? body.product
    : "tarot";
  await query(
    `INSERT INTO reading_feedback(user_id,target_type,target_id,useful,reason,product)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(user_id,target_type,target_id) DO UPDATE SET
       useful=EXCLUDED.useful,reason=EXCLUDED.reason,product=EXCLUDED.product,updated_at=NOW()`,
    [auth.profileUserId, targetType, targetId, useful, useful ? null : reason, product]
  );
  await recordProductActivity(auth.profileUserId, "feedback_sent", `${targetType}:${targetId}`, { product });
  return NextResponse.json({ ok: true });
}
