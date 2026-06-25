import pg from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL ?? "postgresql://auraai:auraai_secret@localhost:5432/auraai";
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node reset-user-password.mjs <email> <password>");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const normalized = email.trim().toLowerCase();
const { rows } = await client.query(
  "SELECT id, email, name FROM user_accounts WHERE email = $1",
  [normalized]
);
const user = rows[0];
if (!user) {
  console.error("User not found:", normalized);
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
await client.query("UPDATE user_accounts SET password_hash = $2 WHERE id = $1", [user.id, hash]);

const ok = await bcrypt.compare(password, hash);
console.log(JSON.stringify({ ok, email: user.email, name: user.name, reset: true }));

await client.end();
