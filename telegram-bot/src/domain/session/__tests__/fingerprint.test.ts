/**
 * Fingerprint must match aura-ai computeGuestResumeFingerprint byte-for-byte.
 */
import { createHash } from "node:crypto";
import { computeFingerprint } from "../token.js";
import { GUEST_MASTER_ID, GUEST_SPREAD_ID, GUEST_SYSTEM } from "../guest-contract.js";

function siteFingerprint(symbols: Array<{ id: number; position: number; reversed: boolean }>): string {
  const ordered = [...symbols]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.id}:${s.position}:${s.reversed ? 1 : 0}`)
    .join("|");
  const payload = [GUEST_SYSTEM, GUEST_MASTER_ID, GUEST_SPREAD_ID, ordered].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

const sample = [
  { id: 0, position: 0, reversed: false },
  { id: 22, position: 1, reversed: true },
  { id: 55, position: 2, reversed: false },
];

const bot = computeFingerprint(sample);
const site = siteFingerprint(sample);
if (bot !== site) {
  console.error("fingerprint mismatch", { bot, site });
  process.exit(1);
}
if (GUEST_SYSTEM !== "tarot-veronika") {
  console.error("GUEST_SYSTEM must be tarot-veronika");
  process.exit(1);
}
console.log("ok: fingerprint parity with site canon", bot.slice(0, 12));
