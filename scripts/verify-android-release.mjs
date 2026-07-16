#!/usr/bin/env node
/**
 * Verify that the downloadable APK matches android-version.json.
 * Usage:
 *   node scripts/verify-android-release.mjs           # exit 1 on failure
 *   node scripts/verify-android-release.mjs --repair  # rewrite manifest from APK (aapt/hash)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  probeApkVersion,
  resolveDownloadableRelease,
  sha256File,
  writeManifest,
  writeGradleVersion,
} from "./lib/android-release-files.mjs";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repair = process.argv.includes("--repair");

const result = resolveDownloadableRelease(root);

function fail(msg) {
  console.error(`verify-android-release: FAIL — ${msg}`);
  process.exit(1);
}

if (!result.versionCode) {
  if (repair && result.apkPath && fs.existsSync(result.apkPath)) {
    const probed = probeApkVersion(result.apkPath);
    if (!probed) fail(`cannot repair: aapt probe failed (${result.reason})`);
    const st = fs.statSync(result.apkPath);
    writeManifest(root, {
      versionCode: probed.versionCode,
      versionName: probed.versionName,
      apkSha256: sha256File(result.apkPath),
      apkBytes: st.size,
    });
    writeGradleVersion(root, probed.versionCode, probed.versionName);
    console.log(
      `verify-android-release: repaired manifest+gradle -> ${probed.versionName} (${probed.versionCode})`
    );
    process.exit(0);
  }
  fail(`no downloadable version (${result.reason})`);
}

if (!result.ok) {
  if (repair) {
    const probed = result.probed ?? probeApkVersion(result.apkPath);
    if (!probed) fail(`cannot repair: ${result.reason}`);
    const st = fs.statSync(result.apkPath);
    writeManifest(root, {
      versionCode: probed.versionCode,
      versionName: probed.versionName,
      apkSha256: result.apkSha256 ?? sha256File(result.apkPath),
      apkBytes: result.apkBytes ?? st.size,
    });
    writeGradleVersion(root, probed.versionCode, probed.versionName);
    console.log(
      `verify-android-release: repaired from APK -> ${probed.versionName} (${probed.versionCode}) [was ${result.reason}]`
    );
    process.exit(0);
  }
  fail(
    `${result.reason}: downloadable=${result.versionCode} manifest=${result.manifest?.versionCode ?? "none"}`
  );
}

console.log(
  `verify-android-release: OK ${result.versionName} (${result.versionCode}) sha256=${(result.apkSha256 ?? "").slice(0, 12)}…`
);
process.exit(0);
