import type { SpreadId } from "@/lib/spreads/types";
import { SPREAD_REGISTRY } from "@/lib/spreads/registry";
import {
  DEFAULT_SPREAD_CATALOG_SETTINGS,
  type SpreadCatalogSettings,
} from "@/lib/spreads/types";
import { mergeSpreadCatalogSettings } from "@/lib/spreads/registry";

export const SPREAD_IDS = Object.keys(SPREAD_REGISTRY) as SpreadId[];

export const SPREAD_ADMIN_LABELS: Record<SpreadId, string> = {
  triplet: "Три карты (дефолт)",
  single: "Одна карта",
  "situation-5": "Расклад на ситуацию (5)",
  "triplet-love": "Любовный триплет",
  "love-7": "Волшебная любовь (7)",
  "yes-no": "Да / Нет",
  "runes-yes-no": "Руны да / нет",
  "celtic-cross": "Кельтский крест",
  "daily-extended": "Расширенный день",
  "week-overview": "Расклад на неделю (7)",
  "year-ahead": "Год вперёд (13)",
  "compatibility-12": "Совместимость 12 карт",
  "lenormand-line": "Линия Ленорман (5)",
};

export function mergeSpreadSettingsFromFeatures(
  features: Record<string, unknown> | null | undefined
): SpreadCatalogSettings {
  if (!features) return { ...DEFAULT_SPREAD_CATALOG_SETTINGS };
  return mergeSpreadCatalogSettings({
    spreadsCatalogEnabled:
      typeof features.spreadsCatalogEnabled === "boolean"
        ? features.spreadsCatalogEnabled
        : undefined,
    spreadOverrides:
      features.spreadOverrides && typeof features.spreadOverrides === "object"
        ? (features.spreadOverrides as SpreadCatalogSettings["spreadOverrides"])
        : undefined,
  });
}
