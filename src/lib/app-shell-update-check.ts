"use client";

import {
  dismissOptionalUpdate,
  hadUpdateInstallFailed,
  installedCertMatchesRelease,
  isOptionalUpdateDismissed,
  isForcedUpdateGraceActive,
} from "@/lib/app-update";
import { isLegacyReinstallBuild } from "@/lib/app-update-reinstall";
import { UPDATE_SIGNATURE_MISMATCH } from "@/lib/app-update-errors";
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

function buildReinstallPrompt(
  remote: NonNullable<Awaited<ReturnType<typeof fetchAndroidReleaseInfo>>>,
  buildCode: number,
  forced: boolean
): AppUpdatePromptState {
  return {
    apkUrl: remote.apkUrl,
    releaseNotes: remote.releaseNotes,
    versionName: remote.versionName,
    versionCode: remote.versionCode,
    playStoreUrl: remote.playStoreUrl,
    updateChannel: remote.updateChannel,
    needsReinstall: true,
    initialError: UPDATE_SIGNATURE_MISMATCH,
    forced,
    installedBuildCode: buildCode,
  };
}

export async function checkAndroidAppUpdate(options?: {
  /** Show the optional-update prompt even if the user dismissed it this session (manual re-check). */
  ignoreDismissed?: boolean;
}): Promise<AppUpdatePromptState | null> {
  if (!(await waitForNativeCapacitor())) return null;

  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const remote = await fetchAndroidReleaseInfo();
    const buildCode = Number.parseInt(String(info.build), 10);
    if (!remote || !Number.isFinite(buildCode)) return null;

    const legacyReinstall = isLegacyReinstallBuild(buildCode, remote);
    const certMatch = legacyReinstall ? false : await installedCertMatchesRelease(remote.releaseCertSha256);
    const needsReinstall =
      legacyReinstall ||
      certMatch === false ||
      (buildCode < remote.versionCode && hadUpdateInstallFailed(remote.versionCode));

    if (needsReinstall) {
      const forcedByMin =
        buildCode < remote.minVersionCode && !isForcedUpdateGraceActive(remote.minVersionCode);
      if (buildCode < remote.minVersionCode && isForcedUpdateGraceActive(remote.minVersionCode)) {
        return null;
      }
      // A dismissed, non-forced reinstall prompt must stay dismissed for the
      // rest of the session — previously this branch never consulted the
      // dismissed-state at all, so the banner reappeared on every foreground
      // resume and every 30-minute poll regardless of "Позже".
      if (!forcedByMin && !options?.ignoreDismissed && isOptionalUpdateDismissed(remote.versionCode)) {
        return null;
      }
      return buildReinstallPrompt(remote, buildCode, forcedByMin);
    }

    const baseUpdate = {
      apkUrl: remote.apkUrl,
      releaseNotes: remote.releaseNotes,
      versionName: remote.versionName,
      versionCode: remote.versionCode,
      playStoreUrl: remote.playStoreUrl,
      updateChannel: remote.updateChannel,
    };

    if (buildCode < remote.minVersionCode) {
      if (isForcedUpdateGraceActive(remote.minVersionCode)) {
        return null;
      }
      return {
        ...baseUpdate,
        forced: true,
        installedBuildCode: buildCode,
      };
    }

    if (
      buildCode < remote.versionCode &&
      (options?.ignoreDismissed || !isOptionalUpdateDismissed(remote.versionCode))
    ) {
      return {
        ...baseUpdate,
        forced: false,
        installedBuildCode: buildCode,
      };
    }
  } catch {
    /* optional */
  }
  return null;
}

export { dismissOptionalUpdate };
