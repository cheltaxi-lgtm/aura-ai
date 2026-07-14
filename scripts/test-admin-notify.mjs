#!/usr/bin/env node
/** Send test message to MAIL_ADMIN_NOTIFY inbox. */
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

const to = process.env.MAIL_ADMIN_NOTIFY?.trim() || process.env.ADMIN_SEED_EMAIL?.trim();
if (!to) {
  console.error("MAIL_ADMIN_NOTIFY or ADMIN_SEED_EMAIL required");
  process.exit(1);
}

const nodemailer = await import("nodemailer");
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.yandex.ru",
  port: Number(process.env.SMTP_PORT || "465"),
  secure: process.env.SMTP_SECURE !== "false",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

try {
  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM || "Zovus <noreply@zovus.ru>",
    to,
    replyTo: process.env.MAIL_SUPPORT || "support@zovus.ru",
    subject: "[Zovus] Admin notify smoke test",
    text: `Admin inbox test at ${new Date().toISOString()}`,
    html: `<p>Admin inbox test at ${new Date().toISOString()}</p>`,
  });
  console.log("sent:", info.messageId || "ok", "to:", to);
} catch (e) {
  console.error("failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
