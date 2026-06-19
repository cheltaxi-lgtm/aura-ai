/** Модели OpenRouter TTS без нормальной поддержки русского (читают кириллицу с англ. акцентом) */
const NON_RUSSIAN_MODEL = /kokoro|orpheus|zonos|csm-1b|canopylabs|zyphra\/zonos/i;

/** Модели с подтверждённой озвучкой русского на Aura */
const RUSSIAN_MODEL = /gemini.*tts|mai-voice|grok-voice|voxtral-mini-tts/i;

export function isPrimarilyCyrillic(text: string): boolean {
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  return cyrillic >= 6 && cyrillic >= latin;
}

export function modelSupportsRussian(model: string): boolean {
  if (NON_RUSSIAN_MODEL.test(model)) return false;
  if (RUSSIAN_MODEL.test(model)) return true;
  return false;
}

export function reorderTtsModelChainForText(models: string[], text: string): string[] {
  if (!isPrimarilyCyrillic(text)) {
    return [...new Set(models)];
  }

  const russianCapable = models.filter(modelSupportsRussian);
  const gemini = russianCapable.find((m) => /gemini.*tts/i.test(m));

  const ordered: string[] = [];
  if (gemini) ordered.push(gemini);
  for (const model of russianCapable) {
    if (!ordered.includes(model)) ordered.push(model);
  }

  return ordered.length ? ordered : models.filter((m) => /gemini.*tts/i.test(m));
}

export function speechModelSupportsRussian(modelId: string): boolean {
  return modelSupportsRussian(modelId);
}
