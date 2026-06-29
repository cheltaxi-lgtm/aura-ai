import pg from "pg";
import { readFileSync } from "fs";

const env = readFileSync("/opt/aura-ai/.env.local", "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!dbUrl) throw new Error("DATABASE_URL missing");

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
const { rows } = await client.query(
  "SELECT value FROM platform_settings WHERE key = $1",
  ["features"]
);
const value = { ...(rows[0]?.value ?? {}), recaptchaEnabled: false };
await client.query(
  "UPDATE platform_settings SET value = $2::jsonb, updated_at = NOW() WHERE key = $1",
  ["features", JSON.stringify(value)]
);
await client.end();
console.log(JSON.stringify({ recaptchaEnabled: value.recaptchaEnabled }));
