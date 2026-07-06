/** Shared limits for photo spread recognition and confirmation. */
export const MAX_PHOTO_CARDS = 12;
export const MAX_PHOTO_CARD_NAME_LENGTH = 80;
export const MAX_PHOTO_POSITION_LENGTH = 120;

export type PhotoRecognitionConfidence = "high" | "medium" | "low" | "unknown";

export function parseRecognitionConfidence(deckType?: string): PhotoRecognitionConfidence {
  if (!deckType?.trim()) return "unknown";
  const text = deckType.toLowerCase();
  if (/уверенност[^\n]*:\s*высок/i.test(text) || /\bвысок/i.test(text)) return "high";
  if (/уверенност[^\n]*:\s*средн/i.test(text) || /\bсредн/i.test(text)) return "medium";
  if (/уверенност[^\n]*:\s*низк/i.test(text) || /\bнизк/i.test(text)) return "low";
  return "unknown";
}

/** Normalize a free-form per-card confidence label from the vision model into a fixed enum. */
export function normalizeCardConfidence(raw?: string | null): PhotoRecognitionConfidence {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text) return "unknown";
  if (/выс|high/.test(text)) return "high";
  if (/сред|medium/.test(text)) return "medium";
  if (/низ|low/.test(text)) return "low";
  return "unknown";
}

export function confidenceLabel(confidence: PhotoRecognitionConfidence): string {
  switch (confidence) {
    case "high":
      return "Распознано уверенно";
    case "medium":
      return "Проверьте карты";
    case "low":
      return "Низкая уверенность — проверьте вручную";
    default:
      return "Проверьте карты перед расшифровкой";
  }
}
