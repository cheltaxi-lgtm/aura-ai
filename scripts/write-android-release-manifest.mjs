#!/usr/bin/env node
/** Sync public/releases/android-version.json from mobile/android/app/build.gradle */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gradlePath = path.join(root, "mobile/android/app/build.gradle");
const outDir = path.join(root, "public/releases");
const outFile = path.join(outDir, "android-version.json");

const gradle = fs.readFileSync(gradlePath, "utf8");
const versionCode = Number.parseInt(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? "", 10);
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? "";

if (!Number.isFinite(versionCode) || versionCode < 1 || !versionName) {
  console.error("write-android-release-manifest: could not parse build.gradle");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  outFile,
  `${JSON.stringify({ versionCode, versionName, builtAt: new Date().toISOString() }, null, 2)}\n`
);
console.log(`android-version.json -> ${versionName} (${versionCode})`);
