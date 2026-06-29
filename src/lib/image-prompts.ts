import type { ImageQuality } from "@/lib/settings";

export type ImageSceneType =
  | "zodiac_avatar"
  | "tarot_atmosphere"
  | "destiny_card"
  | "scene_illustration"
  | "final_report";

export type CharacterVisualKey = "ragnar" | "veronika" | "agafya" | "shri-raj" | "numerolog";

export interface ImageGenerateRequest {
  scene: ImageSceneType;
  characterKey?: CharacterVisualKey | "baba_agafya" | "guru_raj";
  userName?: string;
  zodiac?: string;
  cards?: string[];
  spreadId?: string;
  /** User's question in chat — used to illustrate Q&A, not generic tarot art */
  userQuestionText?: string;
  aiResponseText?: string;
  isPaid?: boolean;
}

export interface BuiltImagePrompt {
  prompt: string;
  aspectRatio: string;
  quality: ImageQuality;
}

const CHARACTER_STYLES: Record<CharacterVisualKey, string> = {
  ragnar:
    "nordic dark fantasy aesthetic, ancient runes carved in stone, icy fjords, Viking mysticism, cold steel and ember glow, brutal masculine energy",
  veronika:
    "ethereal moonlit tarot aesthetic, velvet purple and silver, soft romantic mysticism, rose petals and candlelight, feminine intuitive energy",
  agafya:
    "Slavic folk witchcraft aesthetic, dark forest, birch trees, bonfire smoke, herbal charms, old Russian mysticism, earthy and mysterious",
  "shri-raj":
    "Vedic cosmic aesthetic, saffron and deep indigo, mandalas and star charts, karma wheels, serene guru wisdom, golden celestial light",
  numerolog:
    "numerology sacred geometry aesthetic, golden ratio spirals, glowing numbers, deep indigo and violet palette, soft warm light, elegant feminine mystique",
};

const SCENE_LABELS: Record<ImageSceneType, string> = {
  zodiac_avatar: "аватар знака зодиака",
  tarot_atmosphere: "мистический фон расклада",
  destiny_card: "карта судьбы",
  scene_illustration: "иллюстрация к вопросу и ответу",
  final_report: "итоговый коллаж судьбы",
};

export function normalizeCharacterKey(
  key?: ImageGenerateRequest["characterKey"]
): CharacterVisualKey | undefined {
  if (!key) return undefined;
  if (key === "baba_agafya") return "agafya";
  if (key === "guru_raj") return "shri-raj";
  return key;
}

function cardLabels(cards?: string[]): string {
  if (!cards?.length) return "";
  return cards
    .map((name, i) => `Position ${i + 1}: ${name}`)
    .join(", ");
}

function excerpt(text?: string, max = 200): string {
  if (!text?.trim()) return "";
  const clean = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function buildImagePrompt(
  params: ImageGenerateRequest,
  stylePrefix?: string
): BuiltImagePrompt {
  const { scene, userName, zodiac, cards, userQuestionText, aiResponseText } = params;
  const characterKey = normalizeCharacterKey(params.characterKey);
  const characterStyle = characterKey ? CHARACTER_STYLES[characterKey] : "";
  const cardsText = cardLabels(cards);
  const prefix = stylePrefix?.trim() || "Mystical esoteric digital art, cinematic, highly detailed";
  const base = [prefix, characterStyle].filter(Boolean).join(". ");

  switch (scene) {
    case "zodiac_avatar":
      return {
        prompt: `${base}. Zodiac sign ${zodiac ?? "mystery"} spirit avatar, symbolic constellation portrait, glowing celestial emblem, square mystical icon, no text, no letters, no watermark`,
        aspectRatio: "1:1",
        quality: "standard",
      };

    case "tarot_atmosphere":
      return {
        prompt: `${base}. Mystical tarot reading table atmosphere, tarot cards on velvet cloth, candle smoke, deep shadows, magical particles, cinematic wide background for card spread UI, cards: ${cardsText || "arcane spread cards"}. No readable text on cards`,
        aspectRatio: "16:9",
        quality: "standard",
      };

    case "destiny_card":
      return {
        prompt: `${base}. Ornate personalized destiny card artwork, golden mystical frame, name energy for ${userName ?? "seeker"}, zodiac ${zodiac ?? "stars"}, tarot symbols: ${cardsText || "fateful spread cards"}. Single collectible oracle card, vertical poster art, no readable text except decorative glyphs`,
        aspectRatio: "3:4",
        quality: "standard",
      };

    case "scene_illustration": {
      const question = excerpt(userQuestionText, 280);
      const answer = excerpt(aiResponseText, 420);
      const subject = [question && `Question context: ${question}`, answer && `Answer to visualize: ${answer}`]
        .filter(Boolean)
        .join(". ");

      return {
        prompt: `Cinematic digital illustration depicting the concrete situation described below. Show specific people, places, actions, emotions and outcomes — NOT generic tarot or mystic symbolism. ${subject}. Warm natural lighting, storytelling composition, 16:9 wide frame, richly detailed, no text, no letters, no watermark, no tarot cards unless explicitly mentioned in the texts`,
        aspectRatio: "16:9",
        quality: "standard",
      };
    }

    case "final_report":
      return {
        prompt: `${base}. Epic shareable destiny report collage for ${userName ?? "seeker"}, zodiac ${zodiac ?? "cosmos"}, tarot arc: ${cardsText || "spread cards"}. Golden borders, mystical symbols, premium oracle certificate aesthetic, vertical poster suitable for social sharing, decorative typography shapes only (no readable words)`,
        aspectRatio: "9:16",
        quality: "high",
      };

    default:
      return {
        prompt: `${base}. ${SCENE_LABELS.zodiac_avatar}, no text`,
        aspectRatio: "1:1",
        quality: "standard",
      };
  }
}

export function sceneLabel(scene: ImageSceneType): string {
  return SCENE_LABELS[scene];
}
