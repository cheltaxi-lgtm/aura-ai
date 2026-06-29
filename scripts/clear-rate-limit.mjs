import pg from "pg";
import { readFileSync } from "fs";

const prefix = process.argv[2] ?? "register";
const env = readFileSync("/opt/aura-ai/.env.local", "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!dbUrl) throw new Error("DATABASE_URL missing");

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
const { rowCount } = await client.query(
  "DELETE FROM rate_limit_buckets WHERE bucket_key LIKE $1",
  [`${prefix}:%`]
);
await client.end();
console.log(JSON.stringify({ ok: true, prefix, deleted: rowCount ?? 0 }));
