#!/usr/bin/env node
/** Premium app shell smoke checks. Run: npm run verify:app-shell */
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function mustExist(rel) {
  await access(path.join(root, rel));
}

async function mustInclude(rel, needle, label = needle) {
  const text = await readFile(path.join(root, rel), "utf8");
  assert.ok(text.includes(needle), `${rel} must include ${label}`);
}

const checks = [
  () => mustInclude("src/app/app-shell.css", "touch-action: pan-y pinch-zoom", "root touch-action"),
  () => mustInclude("src/app/app-shell.css", ".app-shell-tabs", "bottom tab bar styles"),
  () => mustInclude("src/app/app-shell.css", "app-shell-has-tabs", "tab bar body padding"),
  () => mustExist("src/components/AppShellBottomNav.tsx"),
  () => mustInclude("src/components/AppShellBottomNav.tsx", "/cabinet", "cabinet route"),
  () => mustExist("src/components/AppShellOfflineGate.tsx"),
  () => mustInclude("src/components/AppShellBridge.tsx", "AppShellOfflineGate", "offline gate wired"),
  () => mustInclude("src/components/AppShellBridge.tsx", "AppShellBottomNav", "bottom nav wired"),
  () => {
    const text = readFile(path.join(root, "src/components/AppShellBridge.tsx"), "utf8");
    return text.then((t) => {
      assert.ok(!t.includes("AppShellVersionBar"), "AppShellBridge must not render AppShellVersionBar");
    });
  },
  () => {
    const text = readFile(path.join(root, "src/components/AppTopHeader.tsx"), "utf8");
    return text.then((t) => {
      assert.ok(!t.includes("iconOnlyOnMobile"), "AppTopHeader must show full wordmark on mobile");
    });
  },
  () => mustInclude("src/components/AppShellBridge.tsx", "checkAndroidAppUpdate", "update check wired"),
  () => mustInclude("mobile/capacitor.config.ts", "errorPath", "capacitor errorPath"),
  () => mustInclude("mobile/capacitor.config.ts", "offline.html", "offline fallback path"),
  () => mustInclude("src/components/HomePage.tsx", "home-active-chat", "active chat scroll class"),
  () => mustInclude("src/components/HomePage.tsx", 'dailyParam === "1"', "daily=1 deep link"),
  () => mustExist("src/lib/app-connectivity.ts"),
  () => mustInclude("src/lib/app-connectivity.ts", "probeAppConnectivity", "connectivity probe"),
  () => mustExist("src/hooks/useAppConnectivity.ts"),
  () => mustExist("src/app/api/platform/status/route.ts"),
  () => mustExist("src/lib/app-shell-update-check.ts"),
  () => mustInclude("src/lib/app-shell-update-check.ts", "checkAndroidAppUpdate", "update check helper"),
  () => mustInclude("src/lib/app-update.ts", "openPlayStoreUpdate", "Play Store update"),
  () => mustExist("mobile/www/offline.html"),
  () => mustInclude("mobile/android/app/src/main/java/ru/zovus/app/AppUpdatePlugin.java", "downloadAndInstall", "native download"),
  () => mustInclude("mobile/android/app/src/main/java/ru/zovus/app/MainActivity.java", "registerPlugin(AppUpdatePlugin.class)", "plugin registration"),
  () => mustExist("src/components/cabinet/CabinetAppVersion.tsx"),
  () => mustInclude("src/components/AppUpdatePrompt.tsx", "app-shell-update-gate", "forced update gate"),
  () => mustExist("public/sw-app-shell.js"),
  () => mustExist("src/components/AppShellServiceWorker.tsx"),
  () => mustInclude("src/components/Providers.tsx", "AppShellServiceWorker", "SW registration wired"),
  () => mustExist("src/app/session/intention/page.tsx"),
  () => mustInclude("src/components/session/SessionFlowLayout.tsx", "FlowStepper", "flow stepper on session routes"),
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
  process.stderr.write(`\nverify-app-shell: ${failed} failed\n`);
  process.exit(1);
}
process.stdout.write("\nverify-app-shell: all checks passed\n");
