#!/usr/bin/env node
/**
 * After a code deploy, build.gradle can regress from the tarball.
 * Re-sync gradle UP to the downloadable APK / env — never invent a higher
 * android-version.json than the APK on disk (that was the 15-vs-19 bug).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readGradleVersion,
  readManifest,
  resolveDownloadableRelease,
  writeGradleVersion,
} from "./lib/android-release-files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env.local");

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

const gradle = readGradleVersion(root);
if (!gradle) {
  console.log("sync-android-version-monotonic: skip (no build.gradle)");
  process.exit(0);
}

const downloadable = resolveDownloadableRelease(root);
const env = readEnvVersion();
const manifest = readManifest(root);

// Target for gradle: max of (honest APK version, env, current gradle).
// Manifest alone must NOT raise gradle above APK when integrity is broken.
const candidates = [];
if (downloadable.versionCode) {
  candidates.push({
    versionCode: downloadable.versionCode,
    versionName: downloadable.versionName,
    source: "apk",
  });
}
if (env) candidates.push({ ...env, source: "env" });
candidates.push({ ...gradle, source: "gradle" });
if (downloadable.ok && manifest) {
  candidates.push({ ...manifest, source: "manifest" });
}

const target = candidates.reduce((max, c) =>
  !max || c.versionCode > max.versionCode ? c : max
);

if (!target) {
  console.log("sync-android-version-monotonic: skip (no version sources)");
  process.exit(0);
}

if (gradle.versionCode < target.versionCode) {
  writeGradleVersion(root, target.versionCode, target.versionName);
  console.log(
    `sync-android-version-monotonic: build.gradle ${gradle.versionCode} -> ${target.versionCode} (${target.versionName}) via ${target.source}`
  );
} else {
  console.log(
    `sync-android-version-monotonic: gradle ok at ${gradle.versionCode} (${gradle.versionName})`
  );
}

if (!downloadable.ok) {
  console.warn(
    `sync-android-version-monotonic: WARN release integrity ${downloadable.reason} — run: node scripts/verify-android-release.mjs --repair`
  );
} else {
  console.log(
    `sync-android-version-monotonic: APK integrity ok at ${downloadable.versionCode} (${downloadable.versionName})`
  );
}

// Never rewrite android-version.json here — only hosting/build-android-apk.sh
// (via write-android-release-manifest.mjs) or verify --repair may publish it.
