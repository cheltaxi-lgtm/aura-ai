import { createHash, randomBytes } from "node:crypto";

export function hashProToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Opaque public token with prefix (zp_ delivery, zf_ intake). */
export function mintProToken(prefix: "zp" | "zf"): {
  raw: string;
  hash: string;
  tokenPrefix: string;
} {
  const secret = randomBytes(24).toString("base64url");
  const raw = `${prefix}_${secret}`;
  return {
    raw,
    hash: hashProToken(raw),
    tokenPrefix: raw.slice(0, 10),
  };
}
