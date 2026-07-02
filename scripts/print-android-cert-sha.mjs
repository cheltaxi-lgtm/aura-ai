#!/usr/bin/env node
/**
 * Print SHA-256 certificate fingerprint(s) for Android App Links (assetlinks.json).
 *
 * Usage:
 *   node scripts/print-android-cert-sha.mjs
 *   node scripts/print-android-cert-sha.mjs --keystore path/to/release.keystore --alias zovus
 *
 * Default: Android debug keystore (~/.android/debug.keystore, alias android).
 */
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const args = { keystore: null, alias: null, storepass: null, keypass: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--keystore") args.keystore = argv[++i];
    else if (arg === "--alias") args.alias = argv[++i];
    else if (arg === "--storepass") args.storepass = argv[++i];
    else if (arg === "--keypass") args.keypass = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

function extractSha256(output) {
  const match = output.match(/SHA-?256:\s*([0-9A-Fa-f:]+)/);
  if (!match) throw new Error("SHA-256 not found in keytool output");
  return match[1].replace(/:/g, "").toUpperCase();
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log(`Usage: node scripts/print-android-cert-sha.mjs [--keystore path] [--alias name]`);
  process.exit(0);
}

const isDebug = !args.keystore;
const keystore =
  args.keystore ||
  path.join(os.homedir(), ".android", "debug.keystore");
const alias = args.alias || (isDebug ? "androiddebugkey" : "zovus");
const storepass = args.storepass || (isDebug ? "android" : process.env.ZOVUS_KEYSTORE_PASSWORD || "");
const keypass = args.keypass || storepass;

if (!storepass) {
  console.error("Set ZOVUS_KEYSTORE_PASSWORD or pass --storepass for release keystores.");
  process.exit(1);
}

const output = spawnSync(
  "keytool",
  [
    "-list",
    "-v",
    "-keystore",
    keystore,
    "-alias",
    alias,
    "-storepass",
    storepass,
    "-keypass",
    keypass,
  ],
  { encoding: "utf8" }
);

if (output.status !== 0) {
  console.error(output.stderr || output.stdout || "keytool failed");
  process.exit(output.status ?? 1);
}

const sha256 = extractSha256(output.stdout || "");

console.log(`Keystore: ${keystore}`);
console.log(`Alias: ${alias}`);
console.log(`SHA-256 (colonless, for ANDROID_ASSETLINKS_SHA256): ${sha256}`);
console.log("");
console.log("Add to Vercel env:");
console.log(`ANDROID_ASSETLINKS_SHA256=${sha256}`);
