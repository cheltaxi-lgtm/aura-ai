/**
 * Full chat history verification: save, restore, cross-session, multi-master, auth
 */
import { SignJWT } from "jose";

const BASE = process.argv[2] ?? "http://192.168.1.152:3000";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "change-me-to-random-32-char-secret-key";
const ACCOUNT_ID = "b5dbca4c-114b-4c62-9546-011ad309e5bb";
const MARKER = `verify-${Date.now()}`;

async function req(path, { method = "GET", body, cookie } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ok: res.ok };
}

async function authCookie() {
  const token = await new SignJWT({ sub: ACCOUNT_ID, role: "user", email: "gamer_club@mail.ru", name: "ГЕННАДИЙ" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(AUTH_SECRET));
  return `aura_auth=${token}`;
}

function check(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function main() {
  const results = [];
  const cookie = await authCookie();

  // Basic endpoints
  results.push(check("GET /", (await req("/")).status === 200));
  results.push(check("GET /cabinet redirects or loads", [200, 307].includes((await req("/cabinet")).status)));
  results.push(check("GET /api/chat/history without auth → 401", (await req("/api/chat/history?characterId=veronika")).status === 401));
  results.push(check("GET /api/cabinet without auth → 401", (await req("/api/cabinet")).status === 401));
  results.push(check("POST /api/debug/client-log → 404", (await req("/api/debug/client-log", { method: "POST", body: {} })).status === 404));

  const profile = await req("/api/profile", { cookie });
  results.push(check("GET /api/profile with auth", profile.ok, `name=${profile.json?.profile?.name ?? profile.json?.name}`));

  const session1 = await req("/api/session", { method: "POST", body: { referrerSlug: null }, cookie });
  const sid1 = session1.json?.sessionId;
  results.push(check("POST /api/session creates session", Boolean(sid1)));

  const userMsg = `${MARKER} история чата`;
  const chat = await req("/api/chat", {
    method: "POST",
    cookie,
    body: {
      characterId: "veronika",
      sessionId: sid1,
      messages: [{ role: "user", content: userMsg }],
      userProfile: { name: "ГЕННАДИЙ", gender: "Мужской", zodiac: "Дева", birthDate: "1980-09-01" },
      tarotCards: [
        { name: "Тройка мечей", meaning: "Боль" },
        { name: "Пятёрка кубков", meaning: "Потеря" },
        { name: "Восьмёрка мечей", meaning: "Страх" },
      ],
    },
  });
  const sidReturned = chat.json?.sessionId ?? sid1;
  results.push(check("POST /api/chat saves reply", chat.ok && Boolean(chat.json?.reply), `sessionId=${sidReturned}`));

  const hist1 = await req(`/api/chat/history?characterId=veronika&sessionId=${sidReturned}`, { cookie });
  const msgs1 = hist1.json?.messages ?? [];
  const hasMarker = msgs1.some((m) => m.content?.includes(MARKER));
  results.push(check("History after chat contains user message", hasMarker, `${msgs1.length} msgs`));

  const session2 = await req("/api/session", { method: "POST", body: { referrerSlug: null }, cookie });
  const sid2 = session2.json?.sessionId;
  const hist2 = await req(`/api/chat/history?characterId=veronika&sessionId=${sid2}`, { cookie });
  const msgs2 = hist2.json?.messages ?? [];
  const crossSession = msgs2.some((m) => m.content?.includes(MARKER));
  results.push(check("History with NEW sessionId (cross-device)", crossSession, `${msgs2.length} msgs, sid2=${sid2}`));

  const histNoSession = await req("/api/chat/history?characterId=veronika", { cookie });
  const msgsNoSession = histNoSession.json?.messages ?? [];
  const noSessionOk = msgsNoSession.some((m) => m.content?.includes(MARKER));
  results.push(check("History without sessionId still returns thread", noSessionOk, `${msgsNoSession.length} msgs`));

  // Other master should NOT contain this marker (isolation)
  const histRagnar = await req(`/api/chat/history?characterId=ragnar&sessionId=${sid2}`, { cookie });
  const ragnarHasMarker = (histRagnar.json?.messages ?? []).some((m) => m.content?.includes(MARKER));
  results.push(check("Ragnar thread isolated from Veronika marker", !ragnarHasMarker));

  const cabinet = await req("/api/cabinet", { cookie });
  results.push(check("GET /api/cabinet with auth", cabinet.ok, `readings=${cabinet.json?.readings?.length ?? 0}`));

  const failed = results.filter((r) => !r).length;
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${results.length} checks)`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
