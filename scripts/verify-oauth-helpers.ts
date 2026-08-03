import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOAuthOpaqueCode,
  hashOAuthOpaqueCode,
  isOAuthOpaqueCode,
} from "../src/lib/oauth/state-cookie";
import {
  getRawQueryParam,
  parseOAuthCallbackParams,
} from "../src/lib/oauth/callback-params";
import { shouldUseVerifiedEmailForLinking } from "../src/lib/oauth/accounts";
import { hasRequiredOAuthConsent } from "../src/lib/oauth/finish";
import {
  buildVkAuthorizeUrl,
  exchangeVkCode,
} from "../src/lib/oauth/providers/vk";
import {
  buildYandexAuthorizeUrl,
  exchangeYandexCode,
} from "../src/lib/oauth/providers/yandex";
import type { OAuthTransaction } from "../src/lib/oauth/types";
import { buildAppOAuthCompleteUrl } from "../src/lib/oauth/app-return";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

// VK often returns code/state in payload and device_id as a sibling query param.
const vkSplitUrl = new URL("https://example.test/callback");
vkSplitUrl.searchParams.set(
  "payload",
  JSON.stringify({ code: "split-code", state: first })
);
vkSplitUrl.searchParams.set("device_id", "sibling-device");
assert.deepEqual(parseOAuthCallbackParams("vk", vkSplitUrl), {
  code: "split-code",
  state: first,
  deviceId: "sibling-device",
  error: null,
});

// URLSearchParams turns bare `+` into space — must not corrupt VK device_id/code.
assert.equal(
  getRawQueryParam("?device_id=abc+def%2Bghi&code=x", "device_id"),
  "abc+def+ghi"
);
const vkPlusUrl = new URL(
  "https://example.test/callback?code=c%2Bode&state=st&device_id=dev+ice%2Bid"
);
assert.deepEqual(parseOAuthCallbackParams("vk", vkPlusUrl), {
  code: "c+ode",
  state: "st",
  deviceId: "dev+ice+id",
  error: null,
});
assert.notEqual(
  new URL("https://example.test/?device_id=dev+ice").searchParams.get("device_id"),
  "dev+ice",
  "sanity: URLSearchParams must mangle bare plus (why we use getRawQueryParam)"
);

// Raw request URL string path (what the callback route passes) must also preserve `+`.
assert.deepEqual(
  parseOAuthCallbackParams(
    "vk",
    "https://example.test/callback?code=c%2Bode&state=st&device_id=dev+ice%2Bid"
  ),
  {
    code: "c+ode",
    state: "st",
    deviceId: "dev+ice+id",
    error: null,
  }
);

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

{
  const bridge = fs.readFileSync(path.join(root, "src/lib/session-bridge.ts"), "utf8");
  assert.ok(bridge.includes("isNativeCapacitorPlatform()"));
  assert.ok(bridge.includes("window.location.replace"));
  assert.ok(
    !bridge.includes("shouldUseAppShellClient()"),
    "desktop app-shell must not force session-bridge (OAuth hang)"
  );
  const bridgeRoute = fs.readFileSync(
    path.join(root, "src/app/api/auth/session-bridge/route.ts"),
    "utf8"
  );
  assert.ok(bridgeRoute.includes('"Referrer-Policy": "no-referrer"'));
  assert.ok(
    bridgeRoute.includes('sanitizeReturnTo(request.nextUrl.searchParams.get("to"), "/")'),
    "session bridge must use a web-safe fallback"
  );
  assert.ok(
    !bridgeRoute.includes('destination.searchParams.set("app", "1")'),
    "desktop session bridge destination must not be forced into app shell"
  );
  assert.ok(
    bridgeRoute.includes("redirectIfAlreadyAuthenticated"),
    "duplicate bridge hits must reuse an already-set auth cookie"
  );
  assert.ok(
    bridgeRoute.includes('oauthError", "session_lost"') ||
      bridgeRoute.includes("session_lost"),
    "bridge failures must surface session_lost instead of a silent login bounce"
  );
}
{
  const complete = fs.readFileSync(
    path.join(root, "src/app/auth/oauth/complete/page.tsx"),
    "utf8"
  );
  assert.ok(complete.includes("OAUTH_COMPLETE_OPERATION_MS"));
  assert.ok(complete.includes("withOperationTimeout"));
  assert.ok(complete.includes("takeHandoffFromLocation"));
  assert.ok(complete.includes("history.replaceState"));
  assert.ok(complete.includes("hardNavigate"));
  assert.ok(complete.includes("skipAuthRecheck"));
  assert.ok(complete.includes("started.current = false"));
  assert.ok(complete.includes("sessionLostUrl"));
  assert.ok(complete.includes("session_lost"));
  assert.ok(!complete.includes("watchdog"));
  assert.ok(!complete.includes('fetchWithTimeout("/api/auth/oauth/handoff"'));
  assert.ok(complete.includes("bg-[#07060c]"));
  assert.ok(complete.includes("Если экран не меняется"));
}
{
  const callback = fs.readFileSync(
    path.join(root, "src/app/api/auth/oauth/[provider]/callback/route.ts"),
    "utf8"
  );
  assert.ok(callback.includes("createOAuthHandoff"));
  assert.ok(
    callback.includes("parseOAuthCallbackParams(provider, request.url)"),
    "callback must parse raw request.url so VK + is not mangled by NextURL"
  );
  assert.ok(
    !callback.includes("buildSessionBridgePath"),
    "web callback must not hop through session-bridge (duplicate Allow → login race)"
  );
  assert.ok(callback.includes("getOAuthTransaction"));
  assert.ok(callback.includes("vk_device_id_required"));
  assert.ok(callback.includes("applyAuthCookie"));
  assert.ok(!callback.includes("#handoff="));
}
{
  const vk = fs.readFileSync(path.join(root, "src/lib/oauth/providers/vk.ts"), "utf8");
  assert.ok(vk.includes('body.set("service_token", vkServiceToken)'));
  assert.ok(vk.includes("id.vk.ru/oauth2/auth?"));
  assert.ok(!vk.includes('body.set("client_secret"'));
  assert.ok(!/"client_secret"\s*:/.test(vk));
}
{
  const registration = fs.readFileSync(
    path.join(root, "src/app/api/auth/oauth/register/route.ts"),
    "utf8"
  );
  assert.ok(registration.includes("const handoff = await createOAuthHandoff"));
  assert.ok(registration.includes("appFlow: completed.pending.appFlow"));
}

async function verifyAsyncCases() {
  await assert.rejects(
    exchangeVkCode("code", "verifier", "https://example.test/callback"),
    /vk_device_id_required/
  );
  await assert.rejects(
    exchangeYandexCode("code", " ", "https://example.test/callback"),
    /yandex_code_verifier_required/
  );
  await assert.rejects(
    exchangeVkCode("code", " ", "https://example.test/callback", {
      deviceId: "device",
    }),
    /vk_code_verifier_required/
  );

  const originalFetch = globalThis.fetch;
  const originalEnv = {
    yandexId: process.env.YANDEX_OAUTH_CLIENT_ID,
    yandexSecret: process.env.YANDEX_OAUTH_CLIENT_SECRET,
    vkId: process.env.VK_CLIENT_ID,
    vkServiceToken: process.env.VK_SERVICE_TOKEN,
    vkProtectedKey: process.env.VK_CLIENT_PROTECTED_KEY,
    vkSecret: process.env.VK_CLIENT_SECRET,
  };
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  process.env.YANDEX_OAUTH_CLIENT_ID = "yandex-client";
  process.env.YANDEX_OAUTH_CLIENT_SECRET = "yandex-secret";
  process.env.VK_CLIENT_ID = "vk-client";
  process.env.VK_SERVICE_TOKEN = "vk-service-token";
  delete process.env.VK_CLIENT_PROTECTED_KEY;
  delete process.env.VK_CLIENT_SECRET;

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      body: new URLSearchParams(typeof init?.body === "string" ? init.body : ""),
    });
    if (url.includes("oauth.yandex.ru/token")) {
      return Response.json({ access_token: "yandex-access" });
    }
    if (url.includes("login.yandex.ru/info")) {
      return Response.json({
        id: "yandex-user",
        default_email: "user@yandex.test",
        display_name: "Yandex User",
      });
    }
    if (url.includes("id.vk.ru/oauth2/auth")) {
      return Response.json({ access_token: "vk-access" });
    }
    if (url.includes("id.vk.ru/oauth2/user_info")) {
      return Response.json({
        user: {
          user_id: "vk-user",
          email: "user@vk.test",
          first_name: "VK",
          last_name: "User",
        },
      });
    }
    throw new Error(`Unexpected OAuth fetch: ${url}`);
  }) as typeof fetch;

  try {
    const yandexAuthorize = new URL(
      buildYandexAuthorizeUrl("state", "challenge", "https://example.test/yandex")
    );
    assert.equal(yandexAuthorize.searchParams.get("code_challenge"), "challenge");
    assert.equal(yandexAuthorize.searchParams.get("code_challenge_method"), "S256");
    assert.equal(yandexAuthorize.searchParams.get("force_confirm"), "yes");
    await exchangeYandexCode("yandex-code", "yandex-verifier", "https://example.test/yandex");
    const yandexToken = calls.find((call) => call.url.includes("oauth.yandex.ru/token"));
    assert.equal(yandexToken?.body.get("client_secret"), "yandex-secret");
    assert.equal(yandexToken?.body.get("code_verifier"), "yandex-verifier");

    const vkAuthorize = new URL(
      buildVkAuthorizeUrl("state", "challenge", "https://example.test/vk")
    );
    assert.equal(vkAuthorize.searchParams.get("code_challenge"), "challenge");
    assert.equal(vkAuthorize.searchParams.get("code_challenge_method"), "S256");
    await exchangeVkCode("vk-code", "vk-verifier", "https://example.test/vk", {
      deviceId: "vk-device",
      state: "state",
    });
    const vkToken = calls.find((call) => call.url.includes("id.vk.ru/oauth2/auth"));
    // Match @vkid/sdk: device_id / code_verifier in query, code (+ service_token) in body.
    const vkTokenUrl = new URL(vkToken!.url);
    assert.equal(vkTokenUrl.searchParams.get("device_id"), "vk-device");
    assert.equal(vkTokenUrl.searchParams.get("code_verifier"), "vk-verifier");
    assert.equal(vkTokenUrl.searchParams.get("grant_type"), "authorization_code");
    assert.equal(vkTokenUrl.searchParams.get("state"), "state");
    assert.equal(vkToken?.body.get("code"), "vk-code");
    assert.equal(vkToken?.body.get("service_token"), "vk-service-token");
    assert.equal(vkToken?.body.has("device_id"), false);
    assert.equal(vkToken?.body.has("client_secret"), false);
  } finally {
    globalThis.fetch = originalFetch;
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("YANDEX_OAUTH_CLIENT_ID", originalEnv.yandexId);
    restore("YANDEX_OAUTH_CLIENT_SECRET", originalEnv.yandexSecret);
    restore("VK_CLIENT_ID", originalEnv.vkId);
    restore("VK_SERVICE_TOKEN", originalEnv.vkServiceToken);
    restore("VK_CLIENT_PROTECTED_KEY", originalEnv.vkProtectedKey);
    restore("VK_CLIENT_SECRET", originalEnv.vkSecret);
  }
  console.log("OAuth helper verification passed");
}

void verifyAsyncCases().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
