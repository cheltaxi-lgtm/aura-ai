import { LEGACY_REINSTALL_BELOW_BUILD } from "@/lib/app-update-errors";
import type { AndroidReleaseInfo } from "@/lib/app-shell-version";

export function reinstallThreshold(remote: Pick<AndroidReleaseInfo, "reinstallBelowVersionCode">): number {
  const fromServer = remote.reinstallBelowVersionCode;
  if (typeof fromServer === "number" && Number.isFinite(fromServer) && fromServer > 0) {
    return fromServer;
  }
  return LEGACY_REINSTALL_BELOW_BUILD;
}

/** Legacy debug-signed APKs cannot receive release updates in-place. */
export function isLegacyReinstallBuild(
  buildCode: number,
  remote: Pick<AndroidReleaseInfo, "reinstallBelowVersionCode">
): boolean {
  if (!Number.isFinite(buildCode)) return false;
  return buildCode < reinstallThreshold(remote);
}
