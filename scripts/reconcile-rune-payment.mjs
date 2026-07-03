#!/usr/bin/env node
/** One-off reconcile for a YooKassa rune payment on production VM. */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const paymentId = process.argv[2];
if (!paymentId) {
  console.error("Usage: node scripts/reconcile-rune-payment.mjs <paymentId>");
  process.exit(1);
}

function loadEnv(file) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "").replace(/\r$/, "");
  }
}

const root = process.cwd();
loadEnv(path.join(root, ".env.local"));

const { fetchYukassaPayment } = await import(pathToFileURL(path.join(root, "src/lib/yukassa.ts")).href);
const { creditRunesFromPayment, getRuneBalance } = await import(
  pathToFileURL(path.join(root, "src/lib/rune-service.ts")).href
);

const payment = await fetchYukassaPayment(paymentId);
if (!payment) {
  console.error("Payment not found");
  process.exit(1);
}

console.log("Payment:", payment.id, payment.status, payment.amount?.value, payment.metadata);

if (payment.status !== "succeeded") {
  console.error("Payment not succeeded");
  process.exit(1);
}

const meta = payment.metadata ?? {};
if (meta.type !== "rune_purchase" || !meta.userId || !meta.packageId) {
  console.error("Not a rune purchase");
  process.exit(1);
}

const amountRub = payment.amount?.value ? Number(payment.amount.value) : undefined;
const credited = await creditRunesFromPayment({
  userId: meta.userId,
  packageId: meta.packageId,
  paymentId: payment.id,
  amountRub: Number.isFinite(amountRub) ? amountRub : undefined,
});

const balance = await getRuneBalance(meta.userId);
console.log(JSON.stringify({ credited, userId: meta.userId, balance, amountRub }, null, 2));
