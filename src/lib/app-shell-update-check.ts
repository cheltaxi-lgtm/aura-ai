"use client";

import { dismissOptionalUpdate, isOptionalUpdateDismissed } from "@/lib/app-update";
import { fetchAndroidReleaseInfo } from "@/lib/app-shell-version";
import { isNativeCapacitorPlatform } from "@/lib/app-shell";
import type { AppUpdatePromptState } from "@/components/AppUpdatePrompt";

const CAPACITOR_WAIT_MS = 4_000;
const CAPACITOR_POLL_MS = 150;

export async function waitForNativeCapacitor(maxMs = CAPACITOR_WAIT_MS): Promise<boolean> {
  if (isNativeCapacitorPlatform()) return true;
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    await new Promise((r) => setTimeout(r, CAPACITOR_POLL_MS));
    if (isNativeCapacitorPlatform()) return true;
  }
  return isNativeCapacitorPlatform();
}

export async function checkAndroidAppUpdate(): Promise<AppUpdatePromptState | null> {
  if (!(await waitForNativeCapacitor())) return null;

  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const remote = await fetchAndroidReleaseInfo();
    const buildCode = Number.parseInt(String(info.build), 10);
    if (!remote || !Number.isFinite(buildCode)) return null;

    if (buildCode < remote.minVersionCode) {
      return {
        apkUrl: remote.apkUrl,
        releaseNotes: remote.releaseNotes,
        versionName: remote.versionName,
        versionCode: remote.versionCode,
        forced: true,
        playStoreUrl: remote.playStoreUrl,
        updateChannel: remote.updateChannel,
      };
    }

    if (buildCode < remote.versionCode && !isOptionalUpdateDismissed(remote.versionCode)) {
      return {
        apkUrl: remote.apkUrl,
        releaseNotes: remote.releaseNotes,
        versionName: remote.versionName,
        versionCode: remote.versionCode,
        forced: false,
        playStoreUrl: remote.playStoreUrl,
        updateChannel: remote.updateChannel,
      };
    }
  } catch {
    /* optional */
  }
  return null;
}

export { dismissOptionalUpdate };
