import type { NextRequest } from "next/server";

import { ensureDb, queryClient, withTransaction } from "@/lib/db";
import { resolvePendingGuestResume } from "@/lib/guest-triplet-pending";

export const GUEST_REGISTRATION_FUNNEL_SOURCE = "guest_registration_funnel";

export type GuestRegistrationFunnelEvent =
  | "receipt_issued"
  | "receipt_reused"
  | "auth_started"
  | "account_created"
  | "claim_succeeded"
  | "claim_failed";

type FunnelMetadata = {
  method?: "email" | `oauth:${string}`;
  reason?: "already_used" | "unavailable";
};

/** Privacy-safe operational funnel: no email, question, card text or IP. */
export async function recordGuestRegistrationFunnelEvent(input: {
  event: GuestRegistrationFunnelEvent;
  receiptId: string;
  profileUserId?: string | null;
  metadata?: FunnelMetadata;
}): Promise<void> {
  try {
    if (!(await ensureDb())) return;
    const idempotencyKey = `${input.receiptId}:${input.event}:${input.metadata?.method ?? input.metadata?.reason ?? ""}`;
    await withTransaction(async (client) => {
      // PostgreSQL UNIQUE treats NULL user_id values as distinct. Serialize by
      // the privacy-safe event key so anonymous retries are race-idempotent too.
      await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `guest-funnel:${idempotencyKey}`,
      ]);
      await queryClient(
        client,
        `INSERT INTO spread_metrics(user_id,event,spread_id,source,idempotency_key,metadata)
         SELECT $1,$2,$3,$4,$5,$6::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM spread_metrics
           WHERE source=$4 AND spread_id=$3 AND event=$2
             AND COALESCE(metadata->>'method','')=COALESCE($7,'')
             AND COALESCE(metadata->>'reason','')=COALESCE($8,'')
         )`,
        [
          input.profileUserId ?? null,
          input.event,
          input.receiptId,
          GUEST_REGISTRATION_FUNNEL_SOURCE,
          idempotencyKey,
          JSON.stringify(input.metadata ?? {}),
          input.metadata?.method ?? null,
          input.metadata?.reason ?? null,
        ]
      );
    });
  } catch (error) {
    console.warn(
      "[guest-registration-funnel] metric skipped",
      error instanceof Error ? error.message : "error"
    );
  }
}

export async function recordPendingGuestRegistrationFunnelEvent(
  request: NextRequest,
  event: Exclude<GuestRegistrationFunnelEvent, "receipt_issued" | "receipt_reused">,
  input: { profileUserId?: string | null; metadata?: FunnelMetadata } = {}
): Promise<string | null> {
  try {
    const pending = await resolvePendingGuestResume(request);
    if (!pending) return null;
    await recordGuestRegistrationFunnelEvent({
      event,
      receiptId: pending.receipt.id,
      profileUserId: input.profileUserId,
      metadata: input.metadata,
    });
    return pending.receipt.id;
  } catch (error) {
    console.warn(
      "[guest-registration-funnel] pending receipt unavailable",
      error instanceof Error ? error.message : "error"
    );
    return null;
  }
}
