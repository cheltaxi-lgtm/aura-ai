/**
 * At-rest encryption for capability URLs stored in pro.* (e.g. landings.intake_url).
 * DB dump alone must not leak working intake/report links.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENC_PREFIX = "enc1.";

function key(): Buffer {
  const secret =
    process.env.PRO_TOKEN_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "";
  if (!secret) {
    // No secret configured: keep links working (legacy plaintext behaviour)
    // rather than breaking the module; deploys should set AUTH_SECRET always.
    return createHash("sha256").update("zovus-pro-insecure-default").digest();
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptProSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`;
}

export function decryptProSecret(stored: string): string | null {
  if (!stored.startsWith(ENC_PREFIX)) return null;
  const parts = stored.slice(ENC_PREFIX.length).split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function isEncryptedProSecret(stored: string): boolean {
  return stored.startsWith(ENC_PREFIX);
}

/**
 * Stored intake_url may be legacy plaintext (`/pro/f/zf_...`) or enc1.* blob.
 * Returns the usable public path, or null when undecryptable.
 */
export function resolveProCapabilityUrl(stored: string | null): string | null {
  if (!stored) return null;
  if (stored.startsWith("/")) return stored;
  const plain = decryptProSecret(stored);
  return plain?.startsWith("/") ? plain : null;
}
