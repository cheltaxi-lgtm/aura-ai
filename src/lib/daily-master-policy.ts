import { isAiMasterId } from "@/lib/showcase-masters";
import type { CharacterKey } from "@/lib/prompts/types";

export type DailyMasterKey = Exclude<CharacterKey, "numerolog">;

/** Daily's master picker excludes numerology; inherited Matrix selection must too. */
export function resolveDailyMasterKey(master?: string | null): DailyMasterKey {
  return master && isAiMasterId(master) && master !== "numerolog" ? master as DailyMasterKey : "veronika";
}
