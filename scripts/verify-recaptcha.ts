/**
 * reCAPTCHA wiring + behavior checks.
 *
 *   npm run test:recaptcha
 *   RECAPTCHA_TEST_BASE_URL=https://zovus.ru npm run test:recaptcha
 *
 * Unit tests run locally (mocked fetch). HTTP probes hit BASE_URL (default https://zovus.ru).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  RECAPTCHA_SCOPES,
  RECAPTCHA_SCOPE_LABELS,
  type RecaptchaScope,
} from "../src/lib/recaptcha-scopes";
import {
  normalizeRecaptchaRemoteIp,
  verifyRecaptcha,
} from "../src/lib/recaptcha";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

const BASE_URL = (process.env.RECAPTCHA_TEST_BASE_URL ?? "https://zovus.ru").replace(/\/$/, "");

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}

/** Each scope must appear in a server route with enforceRecaptchaScope("scope", ...) */
const SERVER_SCOPE_FILES: Record<RecaptchaScope, string[]> = {
  register: ["app/api/auth/user/register/route.ts"],
  login: ["app/api/auth/user/login/route.ts"],
  expertRegister: ["app/api/auth/expert/register/route.ts"],
  expertLogin: ["app/api/auth/expert/login/route.ts"],
  adminLogin: ["app/api/auth/admin/login/route.ts"],
  support: [
    "app/api/support/tickets/route.ts",
    "app/api/support/tickets/[id]/messages/route.ts",
  ],
  partners: ["app/api/partners/leads/route.ts"],
  chat: ["app/api/chat/route.ts"],
  payments: ["app/api/payment/create/route.ts", "app/api/runes/purchase/route.ts"],
  // share defaults off; create is auth + rate-limit gated (see check below).
  share: [],
};

/** Client must attach token for each scope somewhere */
const CLIENT_SCOPE_HINTS: Record<RecaptchaScope, string[]> = {
  register: ["components/AuthForm.tsx"],
  login: ["components/AuthForm.tsx"],
  expertRegister: ["components/AuthForm.tsx"],
  expertLogin: ["components/AuthForm.tsx"],
  adminLogin: ["components/admin/AdminLoginForm.tsx"],
  support: ["app/cabinet/support/page.tsx"],
  partners: ["components/partners/PartnerInquiryForm.tsx"],
  chat: ["hooks/useChatActions.ts"],
  payments: [
    "components/Paywall.tsx",
    "components/PaywallModal.tsx",
    "components/RuneShopModal.tsx",
  ],
  share: ["contexts/ShareContext.tsx"],
};

function checkStaticWiring() {
  console.log("\n[1] Static wiring");

  for (const scope of RECAPTCHA_SCOPES) {
    ok(Boolean(RECAPTCHA_SCOPE_LABELS[scope]), `label for scope "${scope}"`);

    const serverFiles = SERVER_SCOPE_FILES[scope];
    if (!Array.isArray(serverFiles)) {
      ok(false, `SERVER_SCOPE_FILES missing scope "${scope}"`);
      continue;
    }

    if (scope === "share") {
      // Default-off scope: auth + rate limit on create (not captcha).
      const shareSrc = read("app/api/share/route.ts");
      ok(
        shareSrc.includes("requireProfileUserId") &&
          shareSrc.includes("enforceShareCreateRateLimit"),
        'share create is auth + rate-limit gated (captcha optional/off)'
      );
    } else {
      for (const file of serverFiles) {
        const src = read(file);
        const pattern = new RegExp(`enforceRecaptchaScope\\(\\s*["']${scope}["']`);
        ok(pattern.test(src), `${file} calls enforceRecaptchaScope("${scope}", …)`);
      }
    }

    const clientHints = CLIENT_SCOPE_HINTS[scope];
    if (!Array.isArray(clientHints) || clientHints.length === 0) {
      ok(false, `CLIENT_SCOPE_HINTS missing scope "${scope}"`);
      continue;
    }
    const clientHit = clientHints.some((file) => {
      const src = read(file);
      return src.includes(`"${scope}"`) || src.includes(`'${scope}'`);
    });
    ok(clientHit, `client attaches token for "${scope}" (${clientHints.join(", ")})`);
  }

  // Detect swapped arguments: enforceRecaptchaScope(recaptchaToken, "scope"
  const apiFiles = fs
    .readdirSync(path.join(SRC, "app", "api"), { recursive: true })
    .filter((f): f is string => typeof f === "string" && f.endsWith("route.ts"))
    .map((f) => path.join("app", "api", f.replace(/\\/g, "/")));

  for (const rel of apiFiles) {
    const src = read(rel);
    if (!src.includes("enforceRecaptchaScope")) continue;
    const swapped = /enforceRecaptchaScope\(\s*recaptchaToken\s*,\s*"/.test(src);
    ok(!swapped, `${rel} has no swapped enforceRecaptchaScope(recaptchaToken, "…") args`);
  }
}

function checkIpNormalization() {
  console.log("\n[2] IP normalization");

  ok(normalizeRecaptchaRemoteIp("203.0.113.7") === "203.0.113.7", "single IPv4 kept");
  ok(
    normalizeRecaptchaRemoteIp("203.0.113.7, 10.0.0.1") === undefined,
    "comma-separated chain rejected (use clientIp first)"
  );
  ok(normalizeRecaptchaRemoteIp("unknown") === undefined, '"unknown" omitted');
  ok(normalizeRecaptchaRemoteIp("") === undefined, "empty omitted");
  ok(
    normalizeRecaptchaRemoteIp("2001:db8::1") === "2001:db8::1",
    "IPv6 kept"
  );
}

async function checkVerifyRecaptchaMocked() {
  console.log("\n[3] verifyRecaptcha (mocked Google)");

  const prevSecret = process.env.RECAPTCHA_SECRET_KEY;
  const prevSite = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  process.env.RECAPTCHA_SECRET_KEY = "test-secret";
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = "test-site";

  const originalFetch = global.fetch;

  try {
    global.fetch = (async () =>
      ({
        json: async () => ({ success: true, score: 0.9 }),
      }) as Response);

    const pass = await verifyRecaptcha("valid-token", "203.0.113.7");
    ok(pass.ok, "accepts valid Google response with score 0.9");

    global.fetch = (async () =>
      ({
        json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
      }) as Response);

    const fail = await verifyRecaptcha("bad-token", "203.0.113.7");
    ok(!fail.ok && fail.error === "Проверка reCAPTCHA не пройдена", "rejects Google success:false");

    global.fetch = (async () =>
      ({
        json: async () => ({ success: true, score: 0.1 }),
      }) as Response);

    const low = await verifyRecaptcha("low-score", "203.0.113.7");
    ok(!low.ok, "rejects score below MIN_SCORE");

    const missing = await verifyRecaptcha(undefined, "203.0.113.7");
    ok(!missing.ok && missing.error === "Пройдите проверку reCAPTCHA", "requires token when enabled");
  } finally {
    global.fetch = originalFetch;
    if (prevSecret === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
    else process.env.RECAPTCHA_SECRET_KEY = prevSecret;
    if (prevSite === undefined) delete process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    else process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = prevSite;
  }
}

type HttpCase = {
  scope: RecaptchaScope;
  name: string;
  method: "POST";
  path: string;
  body: Record<string, unknown>;
  /** When captcha enabled: missing token should yield this */
  expectMissingCode?: string;
};

const HTTP_CASES: HttpCase[] = [
  {
    scope: "login",
    name: "user login",
    method: "POST",
    path: "/api/auth/user/login",
    body: {
      email: "recaptcha-test@example.com",
      password: "wrong-password-xyz",
      ageConfirmed: true,
      acceptedTerms: true,
    },
    expectMissingCode: "recaptcha_failed",
  },
  {
    scope: "expertLogin",
    name: "expert login",
    method: "POST",
    path: "/api/auth/expert/login",
    body: {
      email: "recaptcha-test@example.com",
      password: "wrong-password-xyz",
      ageConfirmed: true,
      acceptedTerms: true,
    },
    expectMissingCode: "recaptcha_failed",
  },
  {
    scope: "adminLogin",
    name: "admin login",
    method: "POST",
    path: "/api/auth/admin/login",
    body: { email: "admin@example.com", password: "wrong-password-xyz" },
    expectMissingCode: "recaptcha_failed",
  },
  {
    scope: "register",
    name: "user register",
    method: "POST",
    path: "/api/auth/user/register",
    body: {
      email: "recaptcha-test@example.com",
      password: "testpass123",
      name: "Test",
      gender: "female",
      birthDate: "1990-01-15",
      ageConfirmed: true,
      acceptedTerms: true,
    },
    expectMissingCode: "recaptcha_failed",
  },
  {
    scope: "expertRegister",
    name: "expert register",
    method: "POST",
    path: "/api/auth/expert/register",
    body: {
      email: "expert-recaptcha-test@example.com",
      password: "testpass123",
      name: "Expert Test",
      ageConfirmed: true,
    },
    expectMissingCode: "recaptcha_failed",
  },
  {
    scope: "chat",
    name: "chat message",
    method: "POST",
    path: "/api/chat",
    body: { message: "test", characterId: "veronika" },
    expectMissingCode: "auth_required",
  },
  {
    scope: "support",
    name: "support ticket",
    method: "POST",
    path: "/api/support/tickets",
    body: { subject: "Test", message: "Hello", category: "general" },
    expectMissingCode: "auth_required",
  },
  {
    scope: "payments",
    name: "payment create",
    method: "POST",
    path: "/api/payment/create",
    body: { sessionId: "00000000-0000-0000-0000-000000000001", plan: "single" },
    expectMissingCode: "auth_required",
  },
  {
    scope: "payments",
    name: "rune purchase",
    method: "POST",
    path: "/api/runes/purchase",
    body: { packageId: "starter" },
    expectMissingCode: "auth_required",
  },
];

async function postJson(
  urlPath: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

async function checkHttpProbes() {
  console.log(`\n[4] HTTP probes (${BASE_URL})`);

  const featuresRes = await fetch(`${BASE_URL}/api/platform/features`);
  const features = (await featuresRes.json()) as {
    expertRegistrationEnabled?: boolean;
    recaptcha?: {
      configured?: boolean;
      masterEnabled?: boolean;
      scopes?: Record<string, boolean>;
    };
  };

  const master = features.recaptcha?.masterEnabled === true;
  const expertRegistrationEnabled = features.expertRegistrationEnabled !== false;
  const scopes = features.recaptcha?.scopes ?? {};
  console.log(
    `  info  recaptcha master=${master} configured=${features.recaptcha?.configured === true}`
  );

  ok(featuresRes.ok, "/api/platform/features returns 200");

  for (const scope of RECAPTCHA_SCOPES) {
    ok(typeof scopes[scope] === "boolean", `features exposes scope "${scope}"`);
  }

  for (const [index, testCase] of HTTP_CASES.entries()) {
    const scopeEnabled = master && scopes[testCase.scope] === true;
    const label = `${testCase.name} [${testCase.scope}]`;
    const probeIp = `203.0.113.${10 + index}`;

    if (testCase.scope === "expertRegister" && !expertRegistrationEnabled) {
      console.log(`  SKIP  ${label} — expert registration disabled on server`);
      continue;
    }

    if (!scopeEnabled) {
      console.log(`  SKIP  ${label} — scope disabled on server`);
      continue;
    }

    const missing = await postJson(testCase.path, testCase.body, {
      "X-Forwarded-For": `${probeIp}, 198.51.100.2`,
    });

    if (testCase.expectMissingCode === "auth_required") {
      ok(
        missing.status === 401 || missing.json.code === "auth_required",
        `${label} without auth → 401 (captcha after auth)`
      );
      continue;
    }

    if (missing.status === 429) {
      console.log(`  SKIP  ${label} — rate limited (use unique IP on retry)`);
      continue;
    }

    ok(
      missing.status === 400 && missing.json.code === "recaptcha_failed",
      `${label} without token → 400 recaptcha_failed (got ${missing.status} ${missing.json.code ?? missing.json.error ?? ""})`
    );

    const invalid = await postJson(
      testCase.path,
      { ...testCase.body, recaptchaToken: "invalid-token-for-test" },
      { "X-Forwarded-For": probeIp }
    );

    if (invalid.status === 429) {
      console.log(`  SKIP  ${label} invalid token — rate limited`);
      continue;
    }

    ok(
      invalid.status === 400 && invalid.json.code === "recaptcha_failed",
      `${label} invalid token → 400 recaptcha_failed (proxy IP fix)`
    );
  }

  if (master && scopes.login) {
    const login = await postJson(
      "/api/auth/user/login",
      {
        email: "recaptcha-test@example.com",
        password: "wrong-password-xyz",
        ageConfirmed: true,
        acceptedTerms: true,
        recaptchaToken: "invalid-token-for-test",
      },
      { "X-Forwarded-For": "203.0.113.250" }
    );
    ok(
      login.status === 400 && login.json.code === "recaptcha_failed",
      "user login rejects invalid token before password check"
    );
  }
}

async function main() {
  console.log("verify-recaptcha");
  checkStaticWiring();
  checkIpNormalization();
  await checkVerifyRecaptchaMocked();
  await checkHttpProbes();

  if (fails > 0) {
    console.error(`\nverify-recaptcha: ${fails} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nverify-recaptcha: all checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
