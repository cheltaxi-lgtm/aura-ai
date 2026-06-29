import { getSetting } from "@/lib/settings";
import { mergeSpreadSettingsFromFeatures } from "@/lib/spread-settings";
import { setSpreadCatalogSettings } from "@/lib/spreads/registry";

let loaded = false;

/** Apply DB spread catalog overrides to in-memory registry (server-only). */
export async function ensureSpreadCatalogSettingsLoaded(): Promise<void> {
  if (loaded) return;
  const features = await getSetting("features");
  setSpreadCatalogSettings(mergeSpreadSettingsFromFeatures(features as Record<string, unknown>));
  loaded = true;
}

export function resetSpreadCatalogSettingsCache(): void {
  loaded = false;
}
