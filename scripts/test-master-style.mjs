/**
 * Test master replies via production chat API.
 * Usage: node scripts/test-master-style.mjs [baseUrl] [label]
 */
import { SignJWT } from "jose";

const BASE = process.argv[2] ?? "http://192.168.1.152:3000";
const LABEL = process.argv[3] ?? "run";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "change-me-to-random-32-char-secret-key";
const ACCOUNT_ID = "b5dbca4c-114b-4c62-9546-011ad309e5bb";
const USER_MSG = "Меня бросил муж после 8 лет отношений. Что карты говорят?";

const MASTERS = ["ragnar", "veronika", "agafya", "shri-raj"];
const CARDS = [
  { name: "Тройка мечей", meaning: "Боль, разлука" },
  { name: "Пятёрка кубков", meaning: "Потеря, сожаление" },
  { name: "Восьмёрка мечей", meaning: "Ловушка, страх" },
];

async function authCookie() {
  const token = await new SignJWT({
    sub: ACCOUNT_ID,
    role: "user",
    email: "gamer_club@mail.ru",
    name: "Анна",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(AUTH_SECRET));
  return `aura_auth=${token}`;
}

async function main() {
  const cookie = await authCookie();
  const sess = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ referrerSlug: null }),
  });
  const { sessionId } = await sess.json();

  console.log(`\n========== ${LABEL} (${BASE}) ==========\n`);

  for (const master of MASTERS) {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        characterId: master,
        sessionId,
        messages: [{ role: "user", content: USER_MSG }],
        userProfile: {
          name: "Анна",
          gender: "Женский",
          zodiac: "Рак",
          birthDate: "1990-07-15",
        },
        tarotCards: CARDS,
      }),
    });
    const data = await res.json();
    console.log(`--- ${master} ---`);
    console.log(data.reply ?? data.error ?? "(empty)");
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
