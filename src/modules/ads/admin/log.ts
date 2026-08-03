import { logAdminAction } from "@/lib/admin";
import { adsQuery } from "../db";

/** Write ads.action_log and, when admin id present, admin_audit_log. */
export async function writeAdsAdminAction(input: {
  adminId?: string;
  actor?: string;
  action: string;
  payload?: unknown;
  result?: unknown;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  const actor = input.actor || (input.adminId ? `admin:${input.adminId}` : "admin");
  await adsQuery(
    `INSERT INTO ads.action_log (actor, action, payload_json, result_json)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
    [
      actor,
      input.action,
      JSON.stringify(input.payload ?? null),
      JSON.stringify(input.result ?? null),
    ]
  );
  if (input.adminId) {
    try {
      await logAdminAction(
        input.adminId,
        input.action,
        input.entityType ?? "ads",
        input.entityId,
        typeof input.payload === "object" && input.payload
          ? (input.payload as Record<string, unknown>)
          : { payload: input.payload }
      );
    } catch {
      /* audit table may be unavailable in isolated tests */
    }
  }
}
