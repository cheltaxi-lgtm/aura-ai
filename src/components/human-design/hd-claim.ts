/**
 * Guest-chart claim tokens: the browser that created a guest chart proves
 * ownership after login. Tokens live in localStorage; every storage access is
 * wrapped — private-mode Safari throws on write and must not break the flow.
 */

const CLAIM_PREFIX = "hd:claim-token:";

/** Last computed chart fingerprint — HdCalculator restores it on mount. */
export const HD_LAST_FINGERPRINT_KEY = "hd:last-fingerprint";

export function hdClaimTokenKey(fingerprint: string): string {
  return `${CLAIM_PREFIX}${fingerprint}`;
}

export function storeHdClaimToken(fingerprint: string, token: string | null | undefined): void {
  if (!token) return;
  try {
    localStorage.setItem(hdClaimTokenKey(fingerprint), token);
  } catch {
    /* storage unavailable — claim capability is lost, chart stays in the guest pool */
  }
}

export function readHdClaimToken(fingerprint: string): string | null {
  try {
    return localStorage.getItem(hdClaimTokenKey(fingerprint));
  } catch {
    return null;
  }
}

export function clearHdClaimToken(fingerprint: string): void {
  try {
    localStorage.removeItem(hdClaimTokenKey(fingerprint));
  } catch {
    /* ignore */
  }
}

/** Remove every claim token (logout/activity purge — no per-fingerprint list needed). */
export function clearAllHdClaimTokens(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CLAIM_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Wipe every HD guest trace this browser holds: the auto-restored last chart
 * and all claim tokens. Must run on logout — otherwise the next visitor (or
 * a different account on the same device) sees/inherits the previous person's
 * charts.
 */
export function clearHdGuestBrowserState(): void {
  try {
    localStorage.removeItem(HD_LAST_FINGERPRINT_KEY);
  } catch {
    /* ignore */
  }
  clearAllHdClaimTokens();
}

/**
 * Claim every guest chart this browser created (main calculator, compatibility
 * calculator). Returns fingerprints that were successfully attached.
 */
export async function claimAllPendingHdCharts(): Promise<string[]> {
  const entries: [string, string][] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CLAIM_PREFIX)) {
        const token = localStorage.getItem(key);
        if (token) entries.push([key.slice(CLAIM_PREFIX.length), token]);
      }
    }
  } catch {
    return [];
  }

  const claimed: string[] = [];
  for (const [fingerprint, claimToken] of entries) {
    try {
      const res = await fetch("/api/human-design/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fingerprint, claimToken }),
      });
      const data = (await res.json().catch(() => null)) as { claimed?: boolean } | null;
      if (res.ok && data?.claimed) {
        clearHdClaimToken(fingerprint);
        claimed.push(fingerprint);
      } else if (res.ok || (res.status >= 400 && res.status < 500)) {
        // Definitive server answer (claimed:false, 404, 410…) — the token is
        // dead (swept, already claimed elsewhere); keeping it only guarantees
        // a doomed retry on every login. Network/5xx keep the token.
        clearHdClaimToken(fingerprint);
      }
    } catch {
      /* network hiccup — keep the token for the next attempt */
    }
  }
  return claimed;
}
