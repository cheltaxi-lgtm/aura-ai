import pg from "pg";
import { readFileSync, writeFileSync } from "fs";

const SITE_KEY = process.argv[2];
const SECRET_KEY = process.argv[3];
if (!SITE_KEY || !SECRET_KEY) {
  console.error("Usage: node scripts/set-recaptcha-env.mjs <siteKey> <secretKey>");
  process.exit(1);
}

const envPath = "/opt/aura-ai/.env.local";
let env = readFileSync(envPath, "utf8");

function upsert(key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : `${env.trimEnd()}\n${line}\n`;
}

upsert("RECAPTCHA_ENABLED", "true");
upsert("NEXT_PUBLIC_RECAPTCHA_ENABLED", "true");
upsert("NEXT_PUBLIC_RECAPTCHA_SITE_KEY", SITE_KEY);
upsert("RECAPTCHA_SECRET_KEY", SECRET_KEY);
writeFileSync(envPath, env.endsWith("\n") ? env : `${env}\n`);

const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!dbUrl) throw new Error("DATABASE_URL missing");

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
const { rows } = await client.query("SELECT value FROM platform_settings WHERE key = $1", [
  "features",
]);
const value = { ...(rows[0]?.value ?? {}), recaptchaEnabled: true };
await client.query(
  "UPDATE platform_settings SET value = $2::jsonb, updated_at = NOW() WHERE key = $1",
  ["features", JSON.stringify(value)]
);
await client.end();

console.log(JSON.stringify({ ok: true, siteKeyPrefix: SITE_KEY.slice(0, 8), recaptchaEnabled: true }));
