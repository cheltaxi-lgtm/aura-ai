import { getSetting, setSetting } from "@/lib/settings";
import { RITUAL_TYPES, RITUAL_TYPE_KEYS, type RitualType } from "@/lib/ritual-config";

export interface RitualTypeSetting {
  enabled: boolean;
  cost: number;
}

export interface RitualSettings {
  types: Record<RitualType, RitualTypeSetting>;
}

export const DEFAULT_RITUAL_SETTINGS: RitualSettings = {
  types: Object.fromEntries(
    RITUAL_TYPE_KEYS.map((key) => [key, { enabled: true, cost: RITUAL_TYPES[key].cost }])
  ) as Record<RitualType, RitualTypeSetting>,
};

/** Admin-controlled overrides for ritual catalog (enable/disable a type, change price without deploy). */
export async function getRitualSettings(): Promise<RitualSettings> {
  const raw = await getSetting("rituals");
  const types: Record<RitualType, RitualTypeSetting> = {
    ...DEFAULT_RITUAL_SETTINGS.types,
  };

  const rawTypes = raw.types as
    | Partial<Record<RitualType, Partial<RitualTypeSetting>>>
    | undefined;
  if (rawTypes) {
    for (const key of RITUAL_TYPE_KEYS) {
      const override = rawTypes[key];
      if (!override) continue;
      const cost = Number(override.cost);
      types[key] = {
        enabled: override.enabled !== false,
        cost:
          Number.isFinite(cost) && cost >= 0
            ? Math.round(cost)
            : DEFAULT_RITUAL_SETTINGS.types[key].cost,
      };
    }
  }

  return { types };
}

export async function setRitualSettings(
  patch: Partial<RitualSettings>,
  adminId?: string
): Promise<RitualSettings> {
  const current = await getRitualSettings();
  const merged: RitualSettings = {
    types: { ...current.types, ...(patch.types ?? {}) },
  };
  await setSetting("rituals", merged, adminId);
  return merged;
}

export function isRitualTypeEnabled(settings: RitualSettings, type: RitualType): boolean {
  return settings.types[type]?.enabled !== false;
}

export function ritualCostFromSettings(settings: RitualSettings, type: RitualType): number {
  return settings.types[type]?.cost ?? RITUAL_TYPES[type].cost;
}
