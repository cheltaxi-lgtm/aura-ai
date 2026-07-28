import { directCall } from "./client";

export async function hasSearchVolume(phrases: string[]) {
  try {
    return await directCall("keywordssresearch", "hasSearchVolume", {
      SelectionCriteria: {
        Keywords: phrases.slice(0, 100),
        RegionIds: [225],
      },
    });
  } catch {
    return { result: null, units: null };
  }
}
