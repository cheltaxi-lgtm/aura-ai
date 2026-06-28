#!/usr/bin/env node
/**
 * Pre-launch env validation (run on VM during deploy).
 * Exits 1 on critical misconfiguration; warns on optional gaps.
 */

const warnings = [];
const errors = [];

function req(name, opts = {}) {
  const v = process.env[name]?.trim();
  if (!v) {
    errors.push(`${name} is not set`);
    return;
  }
  if (opts.placeholder && (v === opts.placeholder || v.startsWith("change-me") || v.startsWith("your-"))) {
    errors.push(`${name} is still a placeholder`);
  }
}

req("DATABASE_URL");
req("AUTH_SECRET", { placeholder: "change-me-to-random-32-char-secret-key" });
req("OPENROUTER_API_KEY");
req("NEXT_PUBLIC_APP_URL");

if (process.env.RECAPTCHA_ENABLED !== "false") {
  req("RECAPTCHA_SECRET_KEY");
}

if (!process.env.YUKASSA_SHOP_ID?.trim() || !process.env.YUKASSA_SECRET_KEY?.trim()) {
  warnings.push("YUKASSA_* not set — rune purchases will return 503");
}

if (!process.env.CRON_SECRET?.trim()) {
  warnings.push("CRON_SECRET not set — background reminders may not run");
}

for (const w of warnings) console.warn(`[launch-env] WARN: ${w}`);
for (const e of errors) console.error(`[launch-env] ERROR: ${e}`);

if (errors.length) {
  console.error("[launch-env] Fix .env.local before accepting users.");
  process.exit(1);
}

console.log("[launch-env] OK — critical env vars present");
