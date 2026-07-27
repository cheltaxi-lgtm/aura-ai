import { CHARACTERS, getCharacterById } from "@/lib/characters";
import type { CabinetSessionRow } from "@/lib/cabinet-data";
import { normalizeStoredDisplayName } from "@/lib/normalize-person-name";
import {
  MARKDOWN_IMAGE_LINE_PATTERN,
  MARKDOWN_IMAGE_PATTERN,
  stripEnglishLeakageFromRussianText,
} from "@/lib/reading-text-polish";
import { ZODIAC_SIGNS, getZodiacFromDate, type ZodiacSign } from "@/utils/zodiac";

export function sortCabinetSessionsByDate(sessions: CabinetSessionRow[]): CabinetSessionRow[] {
  return [...sessions].sort(
    (a, b) => Date.parse(b.sessionDate) - Date.parse(a.sessionDate)
  );
}

export function masterDisplay(key: string) {
  const c = getCharacterById(key);
  return c ? { name: c.name, emoji: c.emoji } : { name: key, emoji: "🔮" };
}

export function resolveZodiacSign(zodiac: string | null, birthDate: string | null): ZodiacSign {
  if (birthDate) {
    try {
      return getZodiacFromDate(birthDate);
    } catch {
      /* fall through */
    }
  }
  if (zodiac) {
    const found = ZODIAC_SIGNS.find(
      (s) => s.name.toLowerCase() === zodiac.toLowerCase() || zodiac.includes(s.name)
    );
    if (found) return found;
  }
  return ZODIAC_SIGNS[0];
}

export function formatCabinetDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function moodEmoji(mood: string | null): string {
  if (!mood) return "😐";
  const m = mood.toLowerCase();
  if (/тревож|страх|беспок|волн/.test(m)) return "😔";
  if (/радост|свет|надеж|спокой/.test(m)) return "😊";
  if (/груст|печал|тоск/.test(m)) return "😢";
  if (/зл|гнев|ярост/.test(m)) return "😤";
  if (/удив|интерес/.test(m)) return "🤔";
  return "😐";
}

export function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

/** Убирает markdown-разметку из сгенерированного текста для отображения в ЛК */
export function stripMarkdownText(text: string): string {
  return text
    .replace(MARKDOWN_IMAGE_PATTERN, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/__/g, "")
    .replace(/_/g, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

/**
 * Короткое превью расклада для карточки истории — без картинок, заголовков и служебного markdown.
 */
export function formatCabinetPredictionPreview(text: string, maxLength = 220): string {
  let out = text.replace(/\r\n/g, "\n").trim();
  if (!out) return "";

  const lines = out.split("\n");
  const bodyLines: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (MARKDOWN_IMAGE_LINE_PATTERN.test(t)) continue;
    if (/^#{1,6}\s/.test(t)) continue;
    if (/^ваш расклад\b/i.test(t)) continue;
    if (/^(?:✦\s*)?простыми словами:?\s*$/i.test(t)) continue;
    const withoutImages = t.replace(MARKDOWN_IMAGE_PATTERN, " ").trim();
    const cardOnly =
      /^[\d\s\wа-яёА-ЯЁ·•,.-]+$/u.test(withoutImages.replace(/\*\*/g, "")) &&
      (withoutImages.match(/·|•/g)?.length ?? 0) >= 2 &&
      withoutImages.length < 120;
    if (cardOnly) continue;
    bodyLines.push(withoutImages);
  }

  out = stripMarkdownText(bodyLines.join(" "));
  out = out.replace(/\s+/g, " ").trim();

  if (!out || out.length < 24) return "";
  return truncate(out, maxLength);
}

/** Исправляет типичные шаблонные огрехи + чистит markdown */
export function sanitizeCabinetDisplayText(text: string): string {
  const preview = formatCabinetPredictionPreview(text, 2000);
  if (preview) {
    return stripEnglishLeakageFromRussianText(
      preview
      .replace(/\bв контексте ваша ситуация\b/gi, "в контексте вашей ситуации")
      .replace(/\bв контексте ваш ситуация\b/gi, "в контексте вашей ситуации")
    );
  }
  return stripEnglishLeakageFromRussianText(
    stripMarkdownText(text)
    .replace(/\bв контексте ваша ситуация\b/gi, "в контексте вашей ситуации")
    .replace(/\bв контексте ваш ситуация\b/gi, "в контексте вашей ситуации")
  );
}

export function formatCabinetDisplayName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  // Show registration/OAuth name as stored; known Latin singles still map to RU.
  return normalizeStoredDisplayName(trimmed, trimmed);
}

export function sessionMastersFromList(sessions: { characterKey: string }[]): typeof CHARACTERS {
  const keys = new Set(sessions.map((s) => s.characterKey));
  return CHARACTERS.filter((c) => keys.has(c.id));
}

export function outcomeRatingLabel(rating: number): string {
  if (rating === 1) return "⭐ Да, точно";
  if (rating === 2) return "🌓 Частично";
  if (rating === 3) return "❌ Нет";
  return "★".repeat(Math.min(5, rating));
}
