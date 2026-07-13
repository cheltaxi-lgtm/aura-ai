import assert from "node:assert/strict";
import {
  createOAuthOpaqueCode,
  hashOAuthOpaqueCode,
  isOAuthOpaqueCode,
} from "../src/lib/oauth/state-cookie";
import { parseOAuthCallbackParams } from "../src/lib/oauth/callback-params";
import { shouldUseVerifiedEmailForLinking } from "../src/lib/oauth/accounts";
import { hasRequiredOAuthConsent } from "../src/lib/oauth/finish";
import { exchangeVkCode } from "../src/lib/oauth/providers/vk";
import type { OAuthTransaction } from "../src/lib/oauth/types";
import { buildAppOAuthCompleteUrl } from "../src/lib/oauth/app-return";

const first = createOAuthOpaqueCode();
const second = createOAuthOpaqueCode();
assert.equal(first.length, 32);
assert.match(first, /^[A-Za-z0-9_-]+$/);
assert.notEqual(first, second);
assert.equal(isOAuthOpaqueCode(first), true);
assert.equal(isOAuthOpaqueCode("short"), false);
assert.equal(hashOAuthOpaqueCode(first).length, 32);
assert.notDeepEqual(hashOAuthOpaqueCode(first), hashOAuthOpaqueCode(second));

const vkUrl = new URL("https://example.test/callback");
vkUrl.searchParams.set(
  "payload",
  JSON.stringify({ code: "code", state: first, device_id: "device" })
);
assert.deepEqual(parseOAuthCallbackParams("vk", vkUrl), {
  code: "code",
  state: first,
  deviceId: "device",
  error: null,
});

const yandexUrl = new URL(
  `https://example.test/callback?code=code&state=${encodeURIComponent(first)}`
);
assert.deepEqual(parseOAuthCallbackParams("yandex", yandexUrl), {
  code: "code",
  state: first,
  deviceId: null,
  error: null,
});

const vkFlatUrl = new URL(
  `https://example.test/callback?code=flat&state=${encodeURIComponent(first)}&device_id=device`
);
assert.deepEqual(parseOAuthCallbackParams("vk", vkFlatUrl), {
  code: "flat",
  state: first,
  deviceId: "device",
  error: null,
});

assert.equal(
  shouldUseVerifiedEmailForLinking({
    providerUserId: "1",
    email: "verified@example.test",
    name: "Verified",
    emailVerified: true,
  }),
  true
);
assert.equal(
  shouldUseVerifiedEmailForLinking({
    providerUserId: "2",
    email: "unverified@example.test",
    name: "Unverified",
    emailVerified: false,
  }),
  false
);

const transaction: OAuthTransaction = {
  provider: "yandex",
  codeVerifier: "verifier",
  redirectUri: "https://example.test/callback",
  returnTo: "/cabinet",
  sessionId: null,
  acceptedTerms: true,
  ageConfirmed: true,
  marketingConsent: false,
  mode: "register",
  appFlow: false,
};
assert.equal(hasRequiredOAuthConsent(transaction), true);
assert.equal(hasRequiredOAuthConsent({ ...transaction, ageConfirmed: false }), false);
assert.equal(
  buildAppOAuthCompleteUrl("/auth/oauth/complete?handoff=opaque&new=0"),
  "zovus://open/auth/oauth/complete?handoff=opaque&new=0"
);
assert.throws(() => buildAppOAuthCompleteUrl("/auth/user/login"), /invalid_oauth_complete_path/);

async function verifyAsyncCases() {
  await assert.rejects(
    exchangeVkCode("code", "verifier", "https://example.test/callback"),
    /vk_device_id_required/
  );
  console.log("OAuth helper verification passed");
}

void verifyAsyncCases().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
