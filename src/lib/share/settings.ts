import { getSetting, setSetting } from "@/lib/settings";
import type { SharePlatformSettings } from "@/lib/settings";

export type ShareSettings = SharePlatformSettings;

const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  enabled: true,
  expiryDays: 90,
  maxExcerptLength: 12000,
};

export async function getShareSettings(): Promise<ShareSettings> {
  const s = await getSetting("share");
  return {
    enabled: s.enabled !== false,
    expiryDays: Number.isFinite(Number(s.expiryDays)) ? Math.max(1, Number(s.expiryDays)) : 90,
    maxExcerptLength: Number.isFinite(Number(s.maxExcerptLength))
      ? Math.min(20000, Math.max(500, Number(s.maxExcerptLength)))
      : 12000,
  };
}

export async function isShareEnabled(): Promise<boolean> {
  const s = await getShareSettings();
  return s.enabled;
}

export async function updateShareSettings(
  values: Partial<ShareSettings>,
  adminId?: string
): Promise<ShareSettings> {
  const current = await getShareSettings();
  const merged = { ...current, ...values };
  await setSetting("share", merged, adminId);
  return merged;
}

export { DEFAULT_SHARE_SETTINGS };
