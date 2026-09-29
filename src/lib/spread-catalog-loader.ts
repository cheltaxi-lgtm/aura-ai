import { getSetting } from "@/lib/settings";
import { mergeSpreadSettingsFromFeatures } from "@/lib/spread-settings";
import { setSpreadCatalogSettings } from "@/lib/spreads/registry";

/** Apply DB spread catalog overrides to in-memory registry (server-only). */
export async function ensureSpreadCatalogSettingsLoaded(): Promise<void> {
  const features = await getSetting("features");
  setSpreadCatalogSettings(mergeSpreadSettingsFromFeatures(features as Record<string, unknown>));
}

export function resetSpreadCatalogSettingsCache(): void {
  // Settings are reloaded for every server request; retained for existing callers.
}
