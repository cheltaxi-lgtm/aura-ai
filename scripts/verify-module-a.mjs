#!/usr/bin/env node
/** Smoke checks for Module A (Capacitor shell). Run: npm run verify:module-a */
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function mustExist(rel) {
  const full = path.join(root, rel);
  await access(full);
  return full;
}

async function mustInclude(rel, needle) {
  const text = await readFile(path.join(root, rel), "utf8");
  assert.ok(text.includes(needle), `${rel} must include ${needle}`);
}

const checks = [
  () => mustExist("mobile/capacitor.config.ts"),
  () => mustExist("mobile/android/app/src/main/AndroidManifest.xml"),
  () => mustExist("src/components/AppDownloadButton.tsx"),
  () => mustExist("src/components/seo/AndroidDownloadBlock.tsx"),
  () => mustInclude("src/components/AppTopHeader.tsx", "AppDownloadButton"),
  () => mustExist("src/components/AppShellBridge.tsx"),
  () => mustExist("src/app/app/page.tsx"),
  () => mustExist("src/app/api/app/android-version/route.ts"),
  () => mustExist(".github/workflows/android-debug.yml"),
  () => mustInclude("mobile/capacitor.config.ts", "ru.zovus.app"),
  () => mustInclude("mobile/android/app/src/main/AndroidManifest.xml", "zovus.ru"),
  () => mustInclude("mobile/android/app/src/main/AndroidManifest.xml", "android.permission.CAMERA"),
  () => mustExist("src/lib/app-update.ts"),
  () => mustExist("src/components/AppUpdatePrompt.tsx"),
  () => mustInclude("mobile/android/app/src/main/AndroidManifest.xml", "REQUEST_INSTALL_PACKAGES"),
  () => mustInclude("mobile/package.json", "@capacitor/camera"),
  () => mustInclude("mobile/package.json", "@capacitor/filesystem"),
  () => mustExist("src/lib/app-camera.ts"),
  () => mustInclude(".github/workflows/android-debug.yml", "node-version: 22"),
];

let failed = 0;
for (const check of checks) {
  try {
    await check();
    process.stdout.write("  PASS\n");
  } catch (err) {
    failed += 1;
    process.stderr.write(`  FAIL ${err instanceof Error ? err.message : err}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\nverify-module-a: ${failed} failed\n`);
  process.exit(1);
}
process.stdout.write("\nverify-module-a: all checks passed\n");
