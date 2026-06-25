/**
 * E2E: chat message save + history restore across sessions
 * Usage: node scripts/e2e-chat-persist.mjs [baseUrl]
 */
import { SignJWT } from "jose";

const BASE = process.argv[2] ?? "http://192.168.1.152:3000";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "change-me-to-random-32-char-secret-key";
const ACCOUNT_ID = "b5dbca4c-114b-4c62-9546-011ad309e5bb";
const EMAIL = "gamer_club@mail.ru";
const MASTER = "veronika";
const MARKER = `e2e-${Date.now()}`;

async function req(path, { method = "GET", body, cookie } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ok: res.ok };
}

async function authCookie() {
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
  return `aura_auth=${token}`;
}

async function main() {
  const cookie = await authCookie();
  const profile = await req("/api/profile", { cookie });
  if (!profile.ok) {
    console.error("FAIL profile", profile.status, profile.json);
    process.exit(1);
  }

  const sessionRes = await req("/api/session", {
    method: "POST",
    body: { referrerSlug: null },
    cookie,
  });
  const sessionId = sessionRes.json?.sessionId;
  if (!sessionId) {
    console.error("FAIL session create", sessionRes.status, sessionRes.json);
    process.exit(2);
  }

  const userMsg = `${MARKER} тест сохранения чата`;
  const chat = await req("/api/chat", {
    method: "POST",
    cookie,
    body: {
      characterId: MASTER,
      sessionId,
      messages: [{ role: "user", content: userMsg }],
      userProfile: {
        name: profile.json?.profile?.name ?? "ГЕННАДИЙ",
        gender: "Мужской",
        zodiac: profile.json?.profile?.zodiac ?? "Дева",
        birthDate: profile.json?.profile?.birthDate ?? "1980-09-01",
      },
      tarotCards: profile.json?.profile?.tarotCards?.slice(0, 3)?.map((c) => ({
        name: c.name,
        meaning: c.meaning ?? "",
      })),
    },
  });

  if (!chat.ok || !chat.json?.reply) {
    console.error("FAIL chat", chat.status, chat.json);
    process.exit(3);
  }

  const returnedSessionId = chat.json.sessionId;
  console.log("chat ok", {
    sessionId: returnedSessionId,
    sessionCreated: chat.json.sessionCreated,
    replyLen: chat.json.reply?.length,
  });

  const history1 = await req(
    `/api/chat/history?characterId=${MASTER}&sessionId=${returnedSessionId ?? sessionId}`,
    { cookie }
  );
  const msgs1 = history1.json?.messages ?? [];
  const hasUser = msgs1.some((m) => m.role === "user" && m.content.includes(MARKER));
  console.log("history after chat", { count: msgs1.length, hasUser, status: history1.status });

  const session2 = await req("/api/session", {
    method: "POST",
    body: { referrerSlug: null },
    cookie,
  });
  const newSessionId = session2.json?.sessionId;
  const history2 = await req(
    `/api/chat/history?characterId=${MASTER}&sessionId=${newSessionId}`,
    { cookie }
  );
  const msgs2 = history2.json?.messages ?? [];
  const hasUserCrossSession = msgs2.some((m) => m.role === "user" && m.content.includes(MARKER));
  console.log("history new session (cross-device sim)", {
    count: msgs2.length,
    hasUserCrossSession,
    newSessionId,
  });

  if (!hasUser) {
    console.error("FAIL: user message not in history after chat");
    process.exit(4);
  }
  if (!hasUserCrossSession) {
    console.error("FAIL: user message not found with different sessionId (profile thread)");
    process.exit(5);
  }

  console.log("PASS chat persistence");
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
