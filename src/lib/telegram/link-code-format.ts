/** Shared link-code shape (safe for client + server). */

/** Current mint length (8 bytes → 16 hex). Legacy 10-hex codes accepted until TTL ends. */
export const LINK_CODE_HEX_LEN = 16;

const LINK_CODE_RE = /^[a-f0-9]{10}$|^[a-f0-9]{16}$/i;

export function isValidLinkCode(code: string): boolean {
  return LINK_CODE_RE.test(code.trim());
}
