/**
 * Verify session_memories upsert for all masters + cabinet API
 * Usage: node scripts/test-cabinet-masters.mjs [baseUrl]
 */
import { SignJWT } from "jose";

const BASE = process.argv[2] ?? "http://192.168.1.152:3000";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "change-me-to-random-32-char-secret-key";
const ACCOUNT_ID = "b5dbca4c-114b-4c62-9546-011ad309e5bb";
const EMAIL = "gamer_club@mail.ru";
const MASTERS = ["agafya", "veronika"];

async function req(path, { method = "GET", body, cookie } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const chunk of parts) {
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            if (json.type === "done") donePayload = json;
          } catch {
            /* skip */
          }
        }
      }
    }
    return { status: res.status, json: donePayload, ok: res.ok && Boolean(donePayload?.reply) };
  }
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

async function chatWithMaster(cookie, profile, master) {
  const sessionRes = await req("/api/session", {
    method: "POST",
    body: { referrerSlug: null, newChatThread: true },
    cookie,
  });
  const sessionId = sessionRes.json?.sessionId;
  if (!sessionId) throw new Error(`session create failed for ${master}`);

  const chat = await req("/api/chat", {
    method: "POST",
    cookie,
    body: {
      characterId: master,
      sessionId,
      newChatThread: true,
      intention: "love",
      messages: [{ role: "user", content: `Тест кабинета ${master} ${Date.now()}` }],
      userProfile: {
        name: profile.json?.profile?.name ?? "ГЕННАДИЙ",
        gender: "Мужской",
        zodiac: profile.json?.profile?.zodiac ?? "Дева",
        birthDate: profile.json?.profile?.birthDate ?? "1980-09-01",
      },
      tarotCards: [
        { name: "Солнце", meaning: "радость" },
        { name: "Луна", meaning: "интуиция" },
        { name: "Звезда", meaning: "надежда" },
      ],
    },
  });

  if (!chat.ok || !chat.json?.reply) {
    throw new Error(`chat failed for ${master}: ${chat.status} ${JSON.stringify(chat.json)}`);
  }

  return { master, sessionId: chat.json.sessionId ?? sessionId, replyLen: chat.json.reply.length };
}

async function main() {
  const cookie = await authCookie();
  const profile = await req("/api/profile", { cookie });
  if (!profile.ok) {
    console.error("FAIL profile", profile.status);
    process.exit(1);
  }

  for (const master of MASTERS) {
    const r = await chatWithMaster(cookie, profile, master);
    console.log("chat ok", r);
  }

  const cabinet = await req("/api/cabinet", { cookie });
  const sessions = cabinet.json?.sessions ?? [];
  const keys = [...new Set(sessions.map((s) => s.characterKey ?? s.character_key))];
  console.log("cabinet sessions", sessions.length, "masters", keys);

  const hasAgafya = keys.includes("agafya");
  const hasVeronika = keys.includes("veronika");
  if (!hasAgafya || !hasVeronika) {
    console.error("FAIL: missing masters in cabinet", { hasAgafya, hasVeronika, keys });
    process.exit(2);
  }

  console.log("PASS cabinet shows multiple masters");
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
