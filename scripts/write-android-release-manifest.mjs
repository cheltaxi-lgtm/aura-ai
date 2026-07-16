#!/usr/bin/env node
/**
 * Publish-time: write android-version.json from the built APK (integrity first).
 * Prefer aapt probe of zovus-latest.apk; fall back to build.gradle only if aapt missing.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  apkPath,
  probeApkVersion,
  readGradleVersion,
  resolveDownloadableRelease,
  sha256File,
  writeManifest,
} from "./lib/android-release-files.mjs";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apk = apkPath(root);

if (!fs.existsSync(apk)) {
  console.error(`write-android-release-manifest: APK missing at ${apk}`);
  process.exit(1);
}

const probed = probeApkVersion(apk);
const gradle = readGradleVersion(root);
const versionCode = probed?.versionCode ?? gradle?.versionCode;
const versionName = probed?.versionName ?? gradle?.versionName;

if (!versionCode || !versionName) {
  console.error("write-android-release-manifest: could not resolve version from APK/gradle");
  process.exit(1);
}

if (probed && gradle && probed.versionCode !== gradle.versionCode) {
  console.error(
    `write-android-release-manifest: APK versionCode ${probed.versionCode} != gradle ${gradle.versionCode}`
  );
  process.exit(1);
}

const st = fs.statSync(apk);
const apkSha256 = sha256File(apk);
const written = writeManifest(root, {
  versionCode,
  versionName,
  builtAt: new Date().toISOString(),
  apkSha256,
  apkBytes: st.size,
});

const check = resolveDownloadableRelease(root);
if (!check.ok || check.versionCode !== versionCode) {
  console.error("write-android-release-manifest: post-write integrity check failed", check.reason);
  process.exit(1);
}

console.log(
  `android-version.json -> ${written.versionName} (${written.versionCode}) sha256=${written.apkSha256.slice(0, 12)}… bytes=${written.apkBytes}`
);
