export type NatalAiContextPurpose = "chat" | "tarot";

export interface NatalAiPreferences {
  aiContextEnabled: boolean;
  tarotContextEnabled: boolean;
}

export function isNatalContextEnabled(
  preferences: NatalAiPreferences,
  purpose: NatalAiContextPurpose
): boolean {
  return purpose === "tarot"
    ? preferences.tarotContextEnabled === true
    : preferences.aiContextEnabled === true;
}
