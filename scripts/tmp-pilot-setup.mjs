/**
 * Set aiDelivery pilot + enable kinds for Premium AI delivery canary.
 * Run on prod: node --env-file=.env.local scripts/tmp-pilot-setup.mjs
 */
import pg from "pg";

const ACCOUNT_EMAIL = "gamer_club@mail.ru";
const ENABLE_KINDS = [
  "reading",
  "intention_spread",
  "daily_reading",
  "daily_extended",
  "photo_reading",
  "ritual_generation",
  "joint_reading",
  "numerology_reading",
  "image_generate",
  "natal_interpretation",
  "natal_forecast",
  "natal_compatibility",
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: accounts } = await client.query(
  `SELECT id, email, profile_user_id, name FROM user_accounts WHERE email = $1 LIMIT 1`,
  [ACCOUNT_EMAIL]
);
if (!accounts[0]) throw new Error(`account not found: ${ACCOUNT_EMAIL}`);
const account = accounts[0];
console.log("account", JSON.stringify(account));

const pilotIds = [account.id, account.profile_user_id].filter(Boolean);
const uniquePilots = [...new Set(pilotIds)];

const { rows: existing } = await client.query(
  `SELECT value FROM platform_settings WHERE key = 'aiDelivery'`
);
const current = existing[0]?.value && typeof existing[0].value === "object" ? existing[0].value : {};
const next = {
  enabledKinds: ENABLE_KINDS,
  pilotAccountIds: uniquePilots,
  maxJobAgeMinutes:
    typeof current.maxJobAgeMinutes === "number" ? current.maxJobAgeMinutes : 45,
  maxAttempts: typeof current.maxAttempts === "number" ? current.maxAttempts : 3,
};

await client.query(
  `INSERT INTO platform_settings (key, value, updated_at)
   VALUES ('aiDelivery', $1::jsonb, NOW())
   ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
  [JSON.stringify(next)]
);

const { rows: verify } = await client.query(
  `SELECT value FROM platform_settings WHERE key = 'aiDelivery'`
);
console.log("aiDelivery_updated", JSON.stringify(verify[0]?.value ?? null));

await client.end();
console.log("OK");
