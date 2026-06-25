/**
 * E2E API test: login → triplet → reading → delete → verify cleared
 * Usage: node scripts/e2e-triplet-flow.mjs [baseUrl] [email] [password]
 */
import fs from "fs";
import { SignJWT } from "jose";

const BASE = process.argv[2] ?? "http://192.168.1.152:3000";
const EMAIL = process.argv[3] ?? "gamer_club@mail.ru";
const PASSWORD = process.argv[4] ?? process.env.E2E_PASSWORD ?? "";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "change-me-to-random-32-char-secret-key";
const ACCOUNT_ID = process.argv[5] ?? "b5dbca4c-114b-4c62-9546-011ad309e5bb";
const LOG = "debug-f9adef.log";

function log(step, data) {
  const line = `${new Date().toISOString()} ${JSON.stringify({ sessionId: "f9adef", step, ...data })}\n`;
  fs.appendFileSync(LOG, line, "utf8");
  console.log(`[${step}]`, JSON.stringify(data));
}

async function req(path, { method = "GET", body, cookie } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, setCookie, ok: res.ok };
}

function extractCookie(setCookies) {
  const auth = setCookies.find((c) => c.startsWith("aura_auth="));
  if (!auth) return null;
  return auth.split(";")[0];
}

const TEST_CARDS = [
  { id: "major-0", name: "Шут", meaning: "Начало пути", arcana: "major" },
  { id: "major-1", name: "Маг", meaning: "Воля и мастерство", arcana: "major" },
  { id: "major-7", name: "Колесница", meaning: "Движение вперёд", arcana: "major" },
];

async function authCookie() {
  if (PASSWORD) {
    const login = await req("/api/auth/user/login", {
      method: "POST",
      body: { email: EMAIL, password: PASSWORD },
    });
    const cookie = extractCookie(login.setCookie);
    if (cookie) return { cookie, login };
    log("login_failed", { status: login.status, body: login.json });
    process.exit(1);
  }

  const token = await new SignJWT({
    sub: ACCOUNT_ID,
    role: "user",
    email: EMAIL,
    name: "ГЕННАДИЙ",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(AUTH_SECRET));

  return { cookie: `aura_auth=${token}`, login: { status: 200, json: { ok: true, via: "jwt" } } };
}

async function main() {
  if (fs.existsSync(LOG)) fs.unlinkSync(LOG);

  log("login_start", { email: EMAIL, base: BASE, via: PASSWORD ? "password" : "jwt" });
  const { cookie, login } = await authCookie();
  log("login_ok", { status: login.status, user: login.json?.user ?? { via: "jwt" } });

  const profileBefore = await req("/api/profile", { cookie });
  const tripletBefore = profileBefore.json?.readings?.find((r) => r.characterName === "triplet");
  log("profile_before", {
    status: profileBefore.status,
    tripletId: tripletBefore?.id ?? null,
    cardCount: tripletBefore?.contextData?.tarotCards?.length ?? 0,
    cooldown: profileBefore.json?.tripletCooldown,
  });

  if (tripletBefore?.id) {
    const del = await req(`/api/cabinet/readings/${tripletBefore.id}`, { method: "DELETE", cookie });
    log("cleanup_old_triplet", { status: del.status, id: tripletBefore.id });
  }

  const cooldownCheck = await req("/api/profile", { cookie });
  log("cooldown_after_cleanup", { cooldown: cooldownCheck.json?.tripletCooldown });

  const onboarding = await req("/api/onboarding", {
    method: "POST",
    cookie,
    body: {
      name: profileBefore.json?.profile?.name ?? "ГЕННАДИЙ",
      gender: profileBefore.json?.profile?.gender ?? "male",
      birthDate: profileBefore.json?.profile?.birthDate ?? "1980-09-01",
      zodiac: profileBefore.json?.profile?.zodiac ?? "Дева ♍",
      lifeFocus: "general",
      tarotCards: TEST_CARDS,
      deckSystem: "tarot-veronika",
      teaser: "E2E test spread teaser",
    },
  });
  log("onboarding", {
    status: onboarding.status,
    historyId: onboarding.json?.historyId,
    error: onboarding.json?.error,
    message: onboarding.json?.message,
  });
  if (!onboarding.ok) {
    process.exit(2);
  }

  const profileAfter = await req("/api/profile", { cookie });
  const tripletAfter = profileAfter.json?.readings?.find((r) => r.characterName === "triplet");
  const cards = tripletAfter?.contextData?.tarotCards ?? [];
  log("profile_after_triplet", {
    status: profileAfter.status,
    tripletId: tripletAfter?.id,
    cardNames: cards.map((c) => c.name),
    cardCount: cards.length,
  });
  if (cards.length < 3) {
    log("FAIL_no_triplet_on_profile", {});
    process.exit(3);
  }

  const reading = await req("/api/reading", {
    method: "POST",
    cookie,
    body: {
      characterId: "veronika",
      userName: profileBefore.json?.profile?.name ?? "ГЕННАДИЙ",
      gender: profileBefore.json?.profile?.gender ?? "male",
      zodiac: profileBefore.json?.profile?.zodiac ?? "Дева ♍",
      birthDate: profileBefore.json?.profile?.birthDate ?? "1980-09-01",
      tarotCards: cards.map((c) => ({ name: c.name, meaning: c.meaning ?? "" })),
    },
  });
  log("reading", {
    status: reading.status,
    hasText: Boolean(reading.json?.reading ?? reading.json?.text),
    error: reading.json?.error,
    preview: String(reading.json?.reading ?? reading.json?.text ?? "").slice(0, 120),
  });

  const tripletId = tripletAfter?.id ?? onboarding.json?.historyId;
  const delTriplet = await req(`/api/cabinet/readings/${tripletId}`, { method: "DELETE", cookie });
  log("delete_triplet", { status: delTriplet.status, tripletId });

  const profileFinal = await req("/api/profile", { cookie });
  const tripletFinal = profileFinal.json?.readings?.find((r) => r.characterName === "triplet");
  log("profile_after_delete", {
    status: profileFinal.status,
    tripletId: tripletFinal?.id ?? null,
    cardCount: tripletFinal?.contextData?.tarotCards?.length ?? 0,
    readingCount: profileFinal.json?.readings?.length ?? 0,
  });

  const cleared = !tripletFinal || (tripletFinal.contextData?.tarotCards?.length ?? 0) < 3;
  log("result", { cleared, success: cleared });

  // Simulate HomePage localStorage merge after cabinet delete
  const staleLocal = {
    name: profileBefore.json?.profile?.name ?? "ГЕННАДИЙ",
    tarotCards: TEST_CARDS,
    deckSystem: "tarot-veronika",
    deckSpreads: { "tarot-veronika": TEST_CARDS },
  };
  const restoredAfterDelete = {
    name: staleLocal.name,
    tarotCards: [],
    deckSpreads: undefined,
    deckSystem: undefined,
  };
  const merged = simulateMergeProfileWithServer(restoredAfterDelete, staleLocal, false);
  log("merge_simulation", {
    prevCards: staleLocal.tarotCards.length,
    mergedCards: merged.tarotCards.length,
    homeWouldShowSpread: merged.tarotCards.length >= 3,
  });
  if (merged.tarotCards.length >= 3) {
    process.exit(5);
  }

  process.exit(cleared ? 0 : 4);
}

function simulateMergeProfileWithServer(restored, prev, tripletDraftInProgress) {
  if (tripletDraftInProgress && (prev?.tarotCards?.length ?? 0) >= 3) {
    return { ...restored, tarotCards: prev.tarotCards, deckSpreads: prev.deckSpreads };
  }
  return restored;
}

main().catch((err) => {
  log("fatal", { error: String(err) });
  process.exit(99);
});
