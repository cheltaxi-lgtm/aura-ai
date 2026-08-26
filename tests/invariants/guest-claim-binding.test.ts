/**
 * Dual-cookie guest claim binding — missing pending guest binding rejects primary claim.
 */
import { describe, expect, it } from "vitest";
import {
  classifySessionClaimBinding,
  evaluateGuestClaimBinding,
  signSessionClaim,
  verifySessionClaimForId,
} from "@/lib/session-claim";
import { landingHeroExpectationCopy } from "@/lib/landing-offer";
import { EDITORIAL_HERO } from "@/lib/editorial-landing-content";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("guest-claim-binding", () => {
  it("classifies ok / missing / mismatch without treating missing as ok", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    const token = await signSessionClaim(id);
    expect(await classifySessionClaimBinding(id, token)).toBe("ok");
    expect(await verifySessionClaimForId(id, token)).toBe(true);
    expect(await classifySessionClaimBinding(id, null)).toBe("missing");
    expect(await classifySessionClaimBinding(id, "")).toBe("missing");
    expect(await classifySessionClaimBinding(id, "not-a-jwt")).toBe("missing");
    const otherToken = await signSessionClaim(other);
    expect(await classifySessionClaimBinding(id, otherToken)).toBe("mismatch");
    expect(await verifySessionClaimForId(id, otherToken)).toBe(false);
  });

  it("A receipt + A binding => primary claim allowed", async () => {
    const receiptA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const tokenA = await signSessionClaim(receiptA);
    const binding = await evaluateGuestClaimBinding(receiptA, tokenA);
    expect(binding.state).toBe("ok");
    expect(binding.bindingOk).toBe(true);
    expect(binding.rejectPrimaryClaim).toBe(false);
  });

  it("A receipt + B binding => primary claim reject", async () => {
    const receiptA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const receiptB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const tokenB = await signSessionClaim(receiptB);
    const binding = await evaluateGuestClaimBinding(receiptA, tokenB);
    expect(binding.state).toBe("mismatch");
    expect(binding.bindingOk).toBe(false);
    expect(binding.rejectPrimaryClaim).toBe(true);
  });

  it("A receipt + missing binding => primary claim reject", async () => {
    const receiptA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    for (const token of [null, "", "not-a-jwt"] as const) {
      const binding = await evaluateGuestClaimBinding(receiptA, token);
      expect(binding.state).toBe("missing");
      expect(binding.bindingOk).toBe(false);
      expect(binding.rejectPrimaryClaim).toBe(true);
    }
  });

  it("claim route requires pending guest binding and clears it after success", () => {
    const claim = readSrc("src/app/api/guest-triplet/claim/route.ts");
    const db = readSrc("src/lib/guest-triplet-receipt-db.ts");
    const complete = readSrc("src/app/api/guest-triplet/complete/route.ts");
    expect(claim).toContain("readGuestBindingCookie");
    expect(claim).toContain("evaluateGuestClaimBinding");
    expect(claim).toContain("clearGuestBindingCookie");
    expect(complete).toContain("setGuestBindingCookie");
    expect(db).toContain("rejectPrimaryClaim");
    expect(db).toMatch(/bindingOk !== true|!bindingOk/);
  });

  it("OAuth/session-bridge between complete and claim preserve A binding", () => {
    const sessionClaim = readSrc("src/lib/session-claim.ts");
    const sessionRoute = readSrc("src/app/api/session/route.ts");
    const sessionAccess = readSrc("src/lib/session-access.ts");
    const bridge = readSrc("src/app/api/auth/session-bridge/route.ts");
    const oauthCallback = readSrc("src/app/api/auth/oauth/[provider]/callback/route.ts");
    const cookies = readSrc("src/lib/guest-resume-cookie.ts");

    expect(cookies).toContain('GUEST_BINDING_COOKIE = "aura_guest_claim"');
    expect(sessionClaim).not.toContain("aura_guest_claim");
    expect(sessionClaim).not.toContain("findPendingGuestBindingId");
    expect(sessionClaim).not.toContain("GUEST_BINDING_COOKIE");
    expect(sessionRoute).not.toContain("aura_guest_claim");
    expect(sessionRoute).not.toContain("zovus_guest_resume");
    expect(sessionAccess).not.toContain("aura_guest_claim");
    expect(bridge).not.toContain("aura_guest_claim");
    expect(bridge).not.toContain("zovus_guest_resume");
    expect(oauthCallback).not.toContain("aura_guest_claim");
    expect(oauthCallback).not.toContain("clearGuestBindingCookie");
    expect(oauthCallback).not.toContain("clearGuestResumeCookie");
  });

  it("receipt cookies stay HttpOnly — not written to localStorage or JSON cache", () => {
    const guest = readSrc("src/components/GuestTripletDraw.tsx");
    const resume = readSrc("src/lib/guest-triplet-resume.ts");
    const ui = readSrc("src/lib/guest-resume-ui-cache.ts");
    const complete = readSrc("src/app/api/guest-triplet/complete/route.ts");
    expect(guest).not.toMatch(
      /localStorage\.setItem\([^)]*(zovus_guest_resume|aura_session_claim|aura_guest_claim)/
    );
    expect(resume).toContain('body: "{}"');
    expect(resume).not.toContain("localStorage.setItem");
    expect(ui).not.toMatch(/\b(zovus_guest_resume|aura_session_claim|aura_guest_claim)\b/);
    expect(ui).not.toMatch(/GUEST_RESUME.*TOKEN|token_hash|resume_token/i);
    expect(complete).not.toMatch(/NextResponse\.json\(\s*\{[^}]*token/);
  });

  it("guest editorial control subtitle stays the live A variant", () => {
    expect(landingHeroExpectationCopy("a")).toBe(EDITORIAL_HERO.subtitle);
    expect(landingHeroExpectationCopy("b")).not.toBe(landingHeroExpectationCopy("c"));
  });
});
