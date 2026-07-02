import { randomBytes } from "crypto";
import { query } from "@/lib/db";
import { enrichShareExcerpt } from "./resolve-excerpt";
import { extractShareSourceMeta, toPublicPayload } from "./public-payload";
import { getShareSettings } from "./settings";
import type { CreateShareResult, SharePayload, ShareSnapshotPayload } from "./types";
import { buildSharePageUrl } from "./build-url";

function generateShareToken(): string {
  return randomBytes(8).toString("base64url").slice(0, 10);
}

export async function createShareSnapshot(
  input: SharePayload,
  userId?: string | null
): Promise<CreateShareResult | null> {
  const settings = await getShareSettings();
  if (!settings.enabled) return null;

  const sourceMeta = extractShareSourceMeta(input);
  const { payload: enriched, excerptTruncated } = await enrichShareExcerpt(input, userId);
  const payload: ShareSnapshotPayload = toPublicPayload(enriched, { excerptTruncated });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + settings.expiryDays);

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateShareToken();
    try {
      try {
        await query(
          `INSERT INTO share_snapshots (token, user_id, kind, payload, source_meta, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            token,
            userId ?? null,
            payload.kind,
            JSON.stringify(payload),
            JSON.stringify(sourceMeta),
            expiresAt.toISOString(),
          ]
        );
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== "42703") throw err;
        await query(
          `INSERT INTO share_snapshots (token, user_id, kind, payload, expires_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [token, userId ?? null, payload.kind, JSON.stringify(payload), expiresAt.toISOString()]
        );
      }
      return { token, url: buildSharePageUrl(token), payload };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "23505") continue;
      throw err;
    }
  }
  return null;
}
