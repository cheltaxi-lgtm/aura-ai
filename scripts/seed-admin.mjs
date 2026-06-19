#!/usr/bin/env node
/**
 * Seed admin account: node scripts/seed-admin.mjs
 * Env: ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD, ADMIN_SEED_NAME, DATABASE_URL
 */
import pg from "pg";
import bcrypt from "bcryptjs";

const email = process.env.ADMIN_SEED_EMAIL;
const password = process.env.ADMIN_SEED_PASSWORD;
const name = process.env.ADMIN_SEED_NAME ?? "Administrator";
const dbUrl = process.env.DATABASE_URL ?? "postgresql://auraai:auraai_secret@localhost:5432/auraai";

if (!email || !password) {
  console.error("Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const hash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO admin_accounts (email, password_hash, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, is_active = TRUE`,
    [email.toLowerCase(), hash, name]
  );
  console.log(`Admin ready: ${email}`);
} finally {
  await client.end();
}
