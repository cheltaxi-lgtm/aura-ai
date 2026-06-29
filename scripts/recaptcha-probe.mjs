import { readFileSync } from "fs";

const env = readFileSync("/opt/aura-ai/.env.local", "utf8");
const secret = env.match(/^RECAPTCHA_SECRET_KEY=(.+)$/m)?.[1]?.trim();
if (!secret) {
  console.error("no secret");
  process.exit(1);
}

const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ secret, response: "test-invalid" }),
});
console.log(JSON.stringify(await res.json()));
