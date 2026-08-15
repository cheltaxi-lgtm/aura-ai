/**
 * Notification dispatch — single entry point for proactive, outbound messages.
 *
 * Writes the in-app notification row. Delivery is in-app only; there is no
 * external email channel.
 */
import { createNotification } from "@/lib/ritual-service";

export interface DispatchNotificationParams {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Optional in-app path a notification CTA should link to (defaults to home). */
  ctaPath?: string;
  ctaLabel?: string;
  /** Logical dedupe key. Duplicate (userId, key) is a no-op, not a 500. */
  idempotencyKey?: string | null;
}

export async function dispatchNotification(params: DispatchNotificationParams): Promise<void> {
  await createNotification({
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    idempotencyKey: params.idempotencyKey,
    // Persist the CTA so the in-app notification panel can render a link.
    data: {
      ...(params.data ?? {}),
      ...(params.ctaPath ? { ctaPath: params.ctaPath } : {}),
      ...(params.ctaLabel ? { ctaLabel: params.ctaLabel } : {}),
    },
  });
}
