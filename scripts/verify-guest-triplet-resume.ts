/**
 * Verify guest-triplet resume security/contracts (unit-style, no live DB).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeGuestResumeFingerprint,
  createGuestResumeToken,
  hashGuestResumeToken,
  isGuestResumeToken,
  sanitizeGuestQuestion,
  validateGuestCompleteInput,
  buildGuestResumeCardsPayload,
  parseGuestResumeCardsPayload,
} from "../src/lib/guest-triplet-receipt.ts";
import { isGuestResumeUiCache } from "../src/lib/guest-resume-ui-cache.ts";
import { resolveRegistrationReturnTo } from "../src/lib/post-auth-return.ts";
import { isSpreadReadingBillingActive } from "../src/lib/rune-afford-client.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function section(name: string) {
  console.log(`\n== ${name} ==`);
}

section("shared module has no node:crypto");
{
  const shared = readSrc("src/lib/guest-triplet-receipt-shared.ts");
  assert.ok(!shared.includes("node:crypto"));
  assert.ok(!/from ['\"]crypto['\"]/.test(shared));
  assert.ok(!shared.includes("createHash"));
  assert.ok(!shared.includes("randomBytes"));
  const uiCache = readSrc("src/lib/guest-resume-ui-cache.ts");
  assert.ok(!uiCache.includes("node:crypto"));
  assert.ok(!uiCache.includes("createHash"));
}

section("client components do not import server receipt module");
{
  const clientFiles = [
    "src/components/GuestTripletDraw.tsx",
    "src/lib/guest-triplet-resume.ts",
    "src/lib/guest-resume-ui-cache.ts",
    "src/components/HomePage.tsx",
    "src/hooks/useOnboardingFlow.ts",
    "src/components/AuthForm.tsx",
    "src/lib/client-user-auth-success.ts",
  ];
  const badImport =
    /from\s+['\"]@\/lib\/guest-triplet-receipt['\"]|from\s+['\"][^'\"]*guest-triplet-receipt['\"]/;
  const okShared =
    /from\s+['\"]@\/lib\/guest-triplet-receipt-shared['\"]|from\s+['\"][^'\"]*guest-triplet-receipt-shared['\"]/;
  for (const file of clientFiles) {
    const src = readSrc(file);
    const lines = src.split("\n");
    for (const line of lines) {
      if (!line.includes("guest-triplet-receipt")) continue;
      if (okShared.test(line)) continue;
      if (line.includes("guest-triplet-receipt-db")) {
        assert.fail(`${file} imports server db module: ${line.trim()}`);
      }
      if (badImport.test(line) && !line.includes("receipt-shared")) {
        assert.fail(`${file} imports server receipt module: ${line.trim()}`);
      }
    }
  }
}

section("validator rejects bad cards / master");
{
  const bad = validateGuestCompleteInput({
    masterId: "ragnar",
    system: "runes",
    spreadId: "triplet",
    cards: [{ id: 1 }, { id: 2 }, { id: 3 }],
  });
  assert.equal(bad.ok, false);

  const tooFew = validateGuestCompleteInput({
    masterId: "veronika",
    system: "tarot-veronika",
    spreadId: "triplet",
    cards: [{ id: 0 }, { id: 1 }],
  });
  assert.equal(tooFew.ok, false);

  const dup = validateGuestCompleteInput({
    masterId: "veronika",
    system: "tarot-veronika",
    spreadId: "triplet",
    cards: [
      { id: 0, position: 0 },
      { id: 0, position: 1 },
      { id: 1, position: 2 },
    ],
  });
  assert.equal(dup.ok, false);
}

section("validator accepts Model A user-selected 3 unique deck ids");
{
  const ok = validateGuestCompleteInput({
    masterId: "veronika",
    system: "tarot-veronika",
    spreadId: "triplet",
    question: "Что происходит в наших отношениях и есть ли шанс?",
    cards: [
      { id: 0, position: 0, reversed: false },
      { id: 1, position: 1, reversed: true },
      { id: 2, position: 2, reversed: false },
    ],
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.symbols.length, 3);
    assert.ok(ok.fingerprint.length === 64);
    const again = computeGuestResumeFingerprint({
      system: ok.system,
      masterId: ok.masterId,
      spreadId: ok.spreadId,
      symbols: ok.symbols,
    });
    assert.equal(again, ok.fingerprint);
  }
}

section("fingerprint ignores display names");
{
  const a = computeGuestResumeFingerprint({
    system: "tarot-veronika",
    masterId: "veronika",
    spreadId: "triplet",
    symbols: [
      { id: 1, name: "A", position: 0, reversed: false },
      { id: 2, name: "B", position: 1, reversed: false },
      { id: 3, name: "C", position: 2, reversed: true },
    ],
  });
  const b = computeGuestResumeFingerprint({
    system: "tarot-veronika",
    masterId: "veronika",
    spreadId: "triplet",
    symbols: [
      { id: 1, name: "Other", position: 0, reversed: false },
      { id: 2, name: "Names", position: 1, reversed: false },
      { id: 3, name: "Here", position: 2, reversed: true },
    ],
  });
  assert.equal(a, b);
}

section("fingerprint preserves selected positions and orientation");
{
  const base = {
    system: "tarot-veronika" as const,
    masterId: "veronika",
    spreadId: "triplet",
  };
  const original = computeGuestResumeFingerprint({
    ...base,
    symbols: [
      { id: 1, name: "A", position: 0, reversed: false },
      { id: 2, name: "B", position: 1, reversed: true },
      { id: 3, name: "C", position: 2, reversed: false },
    ],
  });
  const reordered = computeGuestResumeFingerprint({
    ...base,
    symbols: [
      { id: 1, name: "A", position: 1, reversed: false },
      { id: 2, name: "B", position: 0, reversed: true },
      { id: 3, name: "C", position: 2, reversed: false },
    ],
  });
  const upright = computeGuestResumeFingerprint({
    ...base,
    symbols: [
      { id: 1, name: "A", position: 0, reversed: false },
      { id: 2, name: "B", position: 1, reversed: false },
      { id: 3, name: "C", position: 2, reversed: false },
    ],
  });
  assert.notEqual(original, reordered);
  assert.notEqual(original, upright);
}

section("opaque token hash is not raw token");
{
  const token = createGuestResumeToken();
  assert.ok(isGuestResumeToken(token));
  const hash = hashGuestResumeToken(token);
  assert.notEqual(hash, token);
  assert.equal(hash.length, 64);
}

section("complete stores hash not raw token (static)");
{
  const complete = readSrc("src/app/api/guest-triplet/complete/route.ts");
  assert.ok(complete.includes("hashGuestResumeToken"));
  assert.ok(complete.includes("createGuestResumeToken"));
  assert.ok(complete.includes("setGuestResumeCookie"));
  assert.ok(complete.includes("setGuestBindingCookie"));
  assert.ok(complete.includes("setSessionClaimCookie"));
  assert.ok(!/NextResponse\.json\(\s*\{[^}]*token/.test(complete));
  assert.ok(complete.includes("Never return the opaque token") || !complete.includes("token,"));
}

section("claim uses guest cookie; pending guest binding required for primary claim (static)");
{
  const claim = readSrc("src/app/api/guest-triplet/claim/route.ts");
  assert.ok(claim.includes("readGuestResumeCookie"));
  assert.ok(claim.includes("readGuestBindingCookie"));
  assert.ok(claim.includes("evaluateGuestClaimBinding"));
  assert.ok(claim.includes("clearGuestBindingCookie"));
  assert.ok(claim.includes("requireUserAuth"));
  assert.ok(!claim.includes("body.token") && !claim.includes("body?.token"));
  const db = readSrc("src/lib/guest-triplet-receipt-db.ts");
  assert.ok(
    db.includes("bindingOk !== true") || db.includes("!bindingOk"),
    "primary issued→claimed must reject missing binding"
  );
  assert.ok(db.includes("bindingOk?: boolean") || db.includes("bindingOk?"));
  assert.ok(db.includes("rejectPrimaryClaim"));
  assert.ok(db.includes("guest_resume_status = 'claimed'"));
  assert.ok(db.includes("user_id IS NULL"));
  assert.ok(
    db.includes("profileHasUsedGuestResume") && db.includes("already_used"),
    "claim must reject a second landing free reading per profile"
  );
  const sessionClaim = readSrc("src/lib/session-claim.ts");
  assert.ok(
    !sessionClaim.includes("findPendingGuestBindingId"),
    "chat session claim must not steal pending guest binding"
  );
  assert.ok(!sessionClaim.includes("aura_guest_claim"));
  assert.ok(sessionClaim.includes("classifySessionClaimBinding"));
  assert.ok(sessionClaim.includes("evaluateGuestClaimBinding"));
  assert.ok(sessionClaim.includes("rejectPrimaryClaim: !bindingOk"));
  const guestCookies = readSrc("src/lib/guest-resume-cookie.ts");
  assert.ok(guestCookies.includes('GUEST_BINDING_COOKIE = "aura_guest_claim"'));
  assert.ok(guestCookies.includes("setGuestBindingCookie"));
  const sessionRoute = readSrc("src/app/api/session/route.ts");
  assert.ok(!sessionRoute.includes("aura_guest_claim"));
  assert.ok(!sessionRoute.includes("zovus_guest_resume"));
  const bridge = readSrc("src/app/api/auth/session-bridge/route.ts");
  assert.ok(!bridge.includes("aura_guest_claim"));
  assert.ok(!bridge.includes("zovus_guest_resume"));
  assert.ok(
    db.includes("guest-resume-user:"),
    "claim must lock per profile to stop parallel double-claim"
  );
  const claimRoute = readSrc("src/app/api/guest-triplet/claim/route.ts");
  assert.ok(claimRoute.includes('code: "already_used"'));
  assert.ok(claimRoute.includes("status: 409"));
  const billing = readSrc("src/lib/guest-resume-billing.ts");
  assert.ok(
    billing.includes("profileHasUsedGuestResume"),
    "billing must not free a new claimed receipt after prior use"
  );
}

section("claim not blocked by triplet cooldown (static)");
{
  const claim = readSrc("src/app/api/guest-triplet/claim/route.ts");
  assert.ok(!claim.includes("cooldown"));
  assert.ok(!claim.includes("tripletCooldown"));
  const onboarding = readSrc("src/hooks/useOnboardingFlow.ts");
  assert.ok(onboarding.includes("shouldGuestResume"));
  assert.ok(onboarding.includes("!shouldGuestResume"));
}

section("forged UUID/cards/flags cannot free-read (static)");
{
  const billing = readSrc("src/lib/guest-resume-billing.ts");
  assert.ok(billing.includes("Never trust client"));
  assert.ok(billing.includes("resolveGuestResumeFreeReading"));
  assert.ok(billing.includes("guest_resume_fingerprint"));
  const reading = readSrc("src/app/api/reading/route.ts");
  assert.ok(reading.includes("resolveGuestResumeFreeReading"));
  assert.ok(!/body\.guestResume|body\.billingExempt|body\.isFree/.test(reading));
  assert.ok(reading.includes("setGuestResumeReadingId"));
  assert.ok(reading.includes("guestResume?.readingId"));
}

section("one receipt → durable reading_id reuse (static)");
{
  const db = readSrc("src/lib/guest-triplet-receipt-db.ts");
  assert.ok(db.includes("guest_resume_reading_id"));
  assert.ok(db.includes("reading_consumed"));
  const reading = readSrc("src/app/api/reading/route.ts");
  assert.ok(reading.includes("guest-resume:${guestResume.fingerprint}") || reading.includes("guest-resume:"));
}

section("returnTo guest never emits ask+spread=1");
{
  const href = resolveRegistrationReturnTo({
    guestSpread: true,
    guestMasterId: "veronika",
    guestQuestion: "Длинный вопрос для SEO бага больше восьми",
  });
  assert.ok(!href.includes("ask="), href);
  assert.ok(!href.includes("spread=1"), href);
  // Clean home — claim/onboarding own next step (no master deep-link hijack).
  assert.ok(!href.includes("master="), href);
}

section("SEO without receipt still has ask+spread path (static)");
{
  const home = readSrc("src/components/HomePage.tsx");
  assert.ok(home.includes('params.get("spread") === "1"'));
  assert.ok(home.includes("loadGuestResumeUiCache"));
  assert.ok(home.includes("trackGuestTripletRedrawPrevented"));
}

section("cleanup only issued expired (static)");
{
  const db = readSrc("src/lib/guest-triplet-receipt-db.ts");
  const expireFn = db.slice(db.indexOf("expireUnclaimedGuestResumes"));
  assert.ok(expireFn.includes("guest_resume_status = 'issued'"));
  assert.ok(expireFn.includes("user_id IS NULL"));
  assert.ok(expireFn.includes("guest_resume_expires_at <= NOW()"));
  assert.ok(!expireFn.includes("reading_consumed"));
  const cron = readSrc("src/app/api/cron/guest-resume-expire/route.ts");
  assert.ok(cron.includes("expireUnclaimedGuestResumes"));
}

section("UI cache validator");
{
  assert.equal(isGuestResumeUiCache(null), false);
  assert.equal(
    isGuestResumeUiCache({
      version: 1,
      origin: "guest",
      masterId: "veronika",
      system: "tarot-veronika",
      spreadId: "triplet",
      question: "q",
      teaser: "t",
      cards: [
        { id: 1, name: "A", position: 0, reversed: false },
        { id: 2, name: "B", position: 1, reversed: false },
        { id: 3, name: "C", position: 2, reversed: false },
      ],
      completedAt: new Date().toISOString(),
    }),
    true
  );
}

section("payload roundtrip");
{
  const payload = buildGuestResumeCardsPayload({
    question: sanitizeGuestQuestion("  hello   world  "),
    system: "tarot-veronika",
    symbols: [
      { id: 1, name: "A", position: 0, reversed: false },
      { id: 2, name: "B", position: 1, reversed: true },
      { id: 3, name: "C", position: 2, reversed: false },
    ],
  });
  const parsed = parseGuestResumeCardsPayload(payload);
  assert.ok(parsed);
  assert.equal(parsed?.question, "hello world");
  assert.deepEqual(
    parsed?.symbols.map(({ id, position, reversed }) => ({ id, position, reversed })),
    [
      { id: 1, position: 0, reversed: false },
      { id: 2, position: 1, reversed: true },
      { id: 3, position: 2, reversed: false },
    ]
  );
}

section("client billing preflight treats guest_resume as free UI");
{
  assert.equal(
    isSpreadReadingBillingActive({
      spreadType: "guest_resume",
      isLoggedIn: true,
      runeBillingEnabled: true,
    }),
    false
  );
  assert.equal(
    isSpreadReadingBillingActive({
      spreadType: "new",
      isLoggedIn: true,
      runeBillingEnabled: true,
    }),
    true
  );
}

section("metrika props must not include question/token keys (static check)");
{
  const metrika = readSrc("src/lib/seo/metrika.ts");
  assert.ok(metrika.includes("guest_triplet_resume_detected"));
  assert.ok(metrika.includes("guest_triplet_resume_started"));
  assert.ok(metrika.includes("guest_triplet_resume_completed"));
  assert.ok(metrika.includes("guest_triplet_resume_failed"));
  assert.ok(metrika.includes("guest_triplet_redraw_prevented"));
  const start = metrika.indexOf("trackGuestTripletResumeDetected");
  const end = metrika.indexOf("export function trackRunePurchase");
  const fnBlock = metrika.slice(start, end > start ? end : undefined);
  assert.ok(!/\bquestion\s*:/.test(fnBlock));
  assert.ok(!/\btoken\s*:/.test(fnBlock));
  assert.ok(!/\bfingerprint\s*:/.test(fnBlock));
  assert.ok(!/\bemail\s*:/.test(fnBlock));
  assert.ok(fnBlock.includes("has_question"));
  const sampleProps = {
    has_question: 1,
    master_id: "veronika",
    cards_count: 3,
    stage: "claim",
    reading_mode: "full",
    had_ask_params: 1,
  };
  const forbidden = ["question", "email", "token", "fingerprint", "card_name", "birth"];
  for (const key of Object.keys(sampleProps)) {
    for (const f of forbidden) {
      assert.ok(!key.includes(f) || key === "has_question" || key === "had_ask_params");
    }
  }
}

section("capacitor: no token localStorage fallback (static)");
{
  const coord = readSrc("src/lib/guest-triplet-resume.ts");
  assert.ok(coord.includes("capacitorRecovery"));
  assert.ok(!/localStorage\.setItem\([^)]*token/i.test(coord));
  assert.ok(!/sessionStorage\.setItem\([^)]*token/i.test(coord));
  const ui = readSrc("src/lib/guest-resume-ui-cache.ts");
  // UI cache may mention "token" only in comments forbidding it — never store receipt token.
  assert.ok(!/GUEST_RESUME.*TOKEN|token_hash|resume_token/i.test(ui));
  assert.ok(!/\b(zovus_guest_resume|aura_session_claim|aura_guest_claim)\b/.test(ui));
}

console.log("\nverify-guest-triplet-resume: OK");
