import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { getAsyncJobWorkerUserId } from "@/lib/async-job-worker-auth";

export type ActivationProduct = "reading" | "tarot" | "daily" | "aura" | "palm";
export type ActivationEvent = "offer_shown" | "offer_clicked" | "network_failed" | "request_attempted" | "request_accepted" | "request_rejected";
const REJECTION_CODES = new Set(["insufficient_runes", "age_required", "snapshot_required", "snapshot_not_found", "already_paid_today", "rate_limit", "needs_profile", "auth_required", "feature_disabled"]);

export function activationRejectionCode(status: number, data?: { code?: unknown; error?: unknown }): string {
  const raw = typeof data?.code === "string" ? data.code : typeof data?.error === "string" ? data.error : "";
  const code = raw.toLowerCase();
  if (REJECTION_CODES.has(code)) return code;
  if (status === 429) return "rate_limit";
  if (status === 401) return "auth_required";
  if (status === 403) return "access_denied";
  if (status === 404) return "unavailable";
  if (status === 400 || status === 422) return "validation_rejected";
  if (status >= 500) return "server_error";
  return "request_rejected";
}

/** Operational evidence only. It never updates retention or proves a result was read. */
export async function recordActivationEvent(userId: string, product: ActivationProduct, event: ActivationEvent, key: string, code?: string): Promise<void> {
  try {
    await query(`INSERT INTO spread_metrics(user_id,event,spread_id,source,idempotency_key,metadata)
      SELECT u.id,$2,$3,'activation_funnel',$4,$5::jsonb FROM users u
      JOIN user_accounts ua ON ua.profile_user_id=u.id
      WHERE u.id=$1 AND u.erasure_requested_at IS NULL AND ua.erasure_requested_at IS NULL
      ON CONFLICT(user_id,event,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
    [userId,event,product,`activation:${product}:${key}`,JSON.stringify(code ? { code } : {})]);
  } catch { console.warn("Activation telemetry unavailable"); }
}

/** Observe the existing handler; never alter auth, billing, its response or worker execution. */
export async function observeProductRequest(request: NextRequest, product: ActivationProduct, handler: () => Promise<Response>): Promise<Response> {
  if (getAsyncJobWorkerUserId(request)) return handler();
  let userId: string | null = null;
  try {
    const auth = await requireUserAuth();
    if (auth) userId = await getProfileUserIdForAccount(auth.sub);
  } catch { console.warn("Activation context unavailable"); }
  if (!userId) return handler();
  const key=randomUUID();
  await recordActivationEvent(userId,product,"request_attempted",key);
  try {
    const response=await handler();
    if (response.ok) await recordActivationEvent(userId,product,"request_accepted",key);
    else {
      const data=await response.clone().json().catch(()=>null);
      await recordActivationEvent(userId,product,"request_rejected",key,activationRejectionCode(response.status,data));
    }
    return response;
  } catch (error) {
    await recordActivationEvent(userId,product,"request_rejected",key,"server_error");
    throw error;
  }
}
