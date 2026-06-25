import { SignJWT } from "jose";
import { writeFileSync } from "fs";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "change-me-to-random-32-char-secret-key";
const ACCOUNT_ID = "b5dbca4c-114b-4c62-9546-011ad309e5bb";

const token = await new SignJWT({
  sub: ACCOUNT_ID,
  role: "user",
  email: "gamer_club@mail.ru",
  name: "ГЕННАДИЙ",
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(new TextEncoder().encode(AUTH_SECRET));

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cabinet preview</title>
<style>
body{margin:0;background:#0a0a0f;color:#fff;font-family:system-ui,sans-serif}
iframe{width:100vw;height:100vh;border:0}
</style></head>
<body>
<script>
document.cookie = "aura_auth=${token}; path=/; max-age=7200";
window.location.href = "http://192.168.1.152:3000/cabinet";
</script>
<p>Redirecting to cabinet...</p>
</body></html>`;

writeFileSync("cabinet-auth-bridge.html", html);
console.log("Wrote cabinet-auth-bridge.html — httpOnly cookie cannot be set from JS; use login instead.");
console.log("Token for manual testing:", token.slice(0, 40) + "...");
