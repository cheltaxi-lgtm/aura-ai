import { getSetting, setSetting } from "@/lib/settings";
import type { SharePlatformSettings } from "@/lib/settings";

export type ShareSettings = SharePlatformSettings & {
  channels: ShareChannelSettings;
};

export type ShareChannelSettings = {
  telegram: boolean;
  vk: boolean;
  native: boolean;
  copy: boolean;
  download: boolean;
};

const DEFAULT_CHANNELS: ShareChannelSettings = {
  telegram: true,
  vk: true,
  native: true,
  copy: true,
  download: false,
};

const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  enabled: true,
  expiryDays: 90,
  maxExcerptLength: 50000,
  channels: DEFAULT_CHANNELS,
};

export async function getShareSettings(): Promise<ShareSettings> {
  const s = await getSetting("share");
  return {
    enabled: s.enabled !== false,
    expiryDays: Number.isFinite(Number(s.expiryDays)) ? Math.max(1, Number(s.expiryDays)) : 90,
    maxExcerptLength: Number.isFinite(Number(s.maxExcerptLength))
      ? Math.min(100000, Math.max(500, Number(s.maxExcerptLength)))
      : 50000,
    channels: {
      ...DEFAULT_CHANNELS,
      ...(s.channels as ShareChannelSettings | undefined),
    },
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
  const merged: ShareSettings = {
    ...current,
    ...values,
    channels: {
      ...current.channels,
      ...(values.channels ?? {}),
    },
  };
  await setSetting("share", merged, adminId);
  return merged;
}

export { DEFAULT_SHARE_SETTINGS, DEFAULT_CHANNELS };
