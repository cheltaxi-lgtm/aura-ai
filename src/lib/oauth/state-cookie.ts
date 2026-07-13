import { createHash, randomBytes } from "node:crypto";

/** 192 random bits, URL-safe and exactly 32 opaque characters. */
export function createOAuthOpaqueCode(): string {
  return randomBytes(24).toString("base64url");
}

export function hashOAuthOpaqueCode(code: string): Buffer {
  return createHash("sha256").update(code, "utf8").digest();
}

export function isOAuthOpaqueCode(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(value);
}
