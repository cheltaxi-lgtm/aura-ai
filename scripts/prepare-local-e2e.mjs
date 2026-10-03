// Explicit, disposable local database only. Never use production credentials here.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { SignJWT } from "jose";

const raw = process.env.E2E_DATABASE_URL;
const baseURL = process.env.NATAL_E2E_BASE_URL || "http://127.0.0.1:3417";
const db = new URL(raw || "postgres://invalid/invalid");
if (!["localhost", "127.0.0.1"].includes(db.hostname) || !/test/i.test(db.pathname)
  || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
  throw new Error("E2E_DATABASE_URL must name a disposable local test database; the browser URL must be local.");
}
if (!process.env.AUTH_SECRET) throw new Error("Explicit local AUTH_SECRET required.");
const accountId = "33333333-3333-4333-8333-333333333333";
const profileId = "44444444-4444-4444-8444-444444444444";
const adminId = "55555555-5555-4555-8555-555555555555";
const client = new pg.Client({ connectionString: raw });
await client.connect();
try {
  await client.query("BEGIN");
  const conflict = await client.query("SELECT 1 FROM user_accounts WHERE id=$1 AND email<>$2", [accountId, "first-experience-e2e@example.invalid"]);
  const adminConflict = await client.query("SELECT 1 FROM admin_accounts WHERE id=$1 AND email<>$2", [adminId, "full-audit-admin@example.invalid"]);
  if (conflict.rowCount || adminConflict.rowCount) throw new Error("Fixture identity collision; refusing to overwrite an unrelated account.");
  await client.query(`INSERT INTO users(id,name,gender,birth_date,zodiac,birth_city,rune_balance)
    VALUES($1,'Проверка','female','1990-01-01','Козерог','Москва',300) ON CONFLICT(id) DO NOTHING`, [profileId]);
  await client.query(`INSERT INTO user_accounts(id,email,name,profile_user_id,token_version,age_confirmed_at,terms_accepted_at,email_verified_at)
    VALUES($1,'first-experience-e2e@example.invalid','Проверка',$2,0,now(),now(),now())
    ON CONFLICT(id) DO UPDATE SET profile_user_id=EXCLUDED.profile_user_id,token_version=0,erasure_requested_at=NULL`, [accountId, profileId]);
  await client.query(`INSERT INTO admin_accounts(id,email,password_hash,name,is_active)
    VALUES($1,'full-audit-admin@example.invalid','disabled-password-login','Проверка',true)
    ON CONFLICT(id) DO UPDATE SET is_active=true`, [adminId]);
  for (const key of ["natalChart", "humanDesign", "palmReading", "auraReading", "rituals", "jointReading", "photoReading"]) {
    await client.query(`INSERT INTO platform_settings(key,value) VALUES($1,'{"enabled":true}'::jsonb)
      ON CONFLICT(key) DO UPDATE SET value=platform_settings.value || EXCLUDED.value`, [key]);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { await client.end(); }
const token = await new SignJWT({role:"user",tv:0,email:"first-experience-e2e@example.invalid",name:"Проверка"})
  .setSubject(accountId).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h")
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const output = path.resolve("test-artifacts/local-e2e-storage.json");
fs.mkdirSync(path.dirname(output), {recursive:true});
const host = new URL(baseURL).hostname;
fs.writeFileSync(output, JSON.stringify({cookies:[{name:"aura_auth",value:token,domain:host,path:"/",httpOnly:true,secure:false,sameSite:"Lax",expires:Math.floor(Date.now()/1000)+43200}],origins:[]}));
console.log(`Local fixtures ready; storage state: ${output}. Authenticated fixtures use the real account validity checks.`);
