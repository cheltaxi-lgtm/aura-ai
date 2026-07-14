#!/usr/bin/env node
/**
 * Smoke-test SMTP from current env (or .env.local on server).
 * Usage: node scripts/test-smtp.mjs recipient@example.com
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2];
  }
}

loadEnvLocal();

const to = process.argv[2]?.trim();
if (!to || !to.includes("@")) {
  console.error("Usage: node scripts/test-smtp.mjs recipient@example.com");
  process.exit(1);
}

const host = process.env.SMTP_HOST || "smtp.yandex.ru";
const port = Number(process.env.SMTP_PORT || "465");
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS?.trim();
const from = process.env.EMAIL_FROM || `Zovus <noreply@zovus.ru>`;

if (!user || !pass) {
  console.error("SMTP_USER and SMTP_PASS required");
  process.exit(1);
}

const nodemailer = await import("nodemailer");
const transport = nodemailer.createTransport({
  host,
  port,
  secure: process.env.SMTP_SECURE !== "false",
  auth: { user, pass },
});

try {
  const info = await transport.sendMail({
    from,
    to,
    subject: "Zovus SMTP test",
    text: `SMTP test OK at ${new Date().toISOString()}`,
    html: `<p>SMTP test OK at ${new Date().toISOString()}</p>`,
  });
  console.log("sent:", info.messageId || info.response || "ok");
} catch (err) {
  console.error("failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
