#!/usr/bin/env node
/**
 * After a code deploy, build.gradle can regress to an older versionCode from the
 * dev machine tarball. Re-sync gradle + android-version.json to the monotonic
 * max of .env.local, manifest, and gradle (mirrors hosting/build-android-apk.sh).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envFile = path.join(root, ".env.local");
const gradlePath = path.join(root, "mobile/android/app/build.gradle");
const manifestPath = path.join(root, "public/releases/android-version.json");

function readEnvVersion() {
  try {
    const text = fs.readFileSync(envFile, "utf8");
    const code = Number.parseInt(
      text.match(/^ANDROID_VERSION_CODE=(.+)$/m)?.[1]?.trim() ?? "",
      10
    );
    const name = text.match(/^ANDROID_VERSION_NAME=(.+)$/m)?.[1]?.trim() ?? "";
    if (!Number.isFinite(code) || code < 1 || !name) return null;
    return { versionCode: code, versionName: name };
  } catch {
    return null;
  }
}

function readGradleVersion() {
  try {
    const text = fs.readFileSync(gradlePath, "utf8");
    const versionCode = Number.parseInt(text.match(/versionCode\s+(\d+)/)?.[1] ?? "", 10);
    const versionName = text.match(/versionName\s+"([^"]+)"/)?.[1]?.trim() ?? "";
    if (!Number.isFinite(versionCode) || versionCode < 1 || !versionName) return null;
    return { versionCode, versionName };
  } catch {
    return null;
  }
}

function readManifestVersion() {
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const versionCode = Number.parseInt(String(raw.versionCode ?? ""), 10);
    const versionName = typeof raw.versionName === "string" ? raw.versionName.trim() : "";
    if (!Number.isFinite(versionCode) || versionCode < 1 || !versionName) return null;
    return { versionCode, versionName };
  } catch {
    return null;
  }
}

function pickWinner(candidates) {
  return candidates.reduce(
    (max, candidate) =>
      candidate && (!max || candidate.versionCode > max.versionCode) ? candidate : max,
    null
  );
}

function writeGradleVersion(versionCode, versionName) {
  const text = fs.readFileSync(gradlePath, "utf8");
  const next = text
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
  fs.writeFileSync(gradlePath, next);
}

function writeManifestVersion(versionCode, versionName) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ versionCode, versionName, builtAt: new Date().toISOString() }, null, 2)}\n`
  );
}

const gradle = readGradleVersion();
if (!gradle) {
  console.log("sync-android-version-monotonic: skip (no build.gradle)");
  process.exit(0);
}

const winner = pickWinner([readManifestVersion(), gradle, readEnvVersion()]);
if (!winner) {
  console.log("sync-android-version-monotonic: skip (no version sources)");
  process.exit(0);
}

let changed = false;

if (gradle.versionCode < winner.versionCode) {
  writeGradleVersion(winner.versionCode, winner.versionName);
  console.log(
    `sync-android-version-monotonic: build.gradle ${gradle.versionCode} -> ${winner.versionCode} (${winner.versionName})`
  );
  changed = true;
}

const manifest = readManifestVersion();
if (!manifest || manifest.versionCode < winner.versionCode) {
  writeManifestVersion(winner.versionCode, winner.versionName);
  console.log(
    `sync-android-version-monotonic: android-version.json -> ${winner.versionCode} (${winner.versionName})`
  );
  changed = true;
}

if (!changed) {
  console.log(
    `sync-android-version-monotonic: ok at ${gradle.versionCode} (${gradle.versionName})`
  );
}
