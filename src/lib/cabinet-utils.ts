import { CHARACTERS, getCharacterById } from "@/lib/characters";
import { ZODIAC_SIGNS, getZodiacFromDate, type ZodiacSign } from "@/utils/zodiac";

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
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/__/g, "")
    .replace(/_/g, "")
    .replace(/`/g, "")
    .trim();
}

/** Исправляет типичные шаблонные огрехи + чистит markdown */
export function sanitizeCabinetDisplayText(text: string): string {
  return stripMarkdownText(text)
    .replace(/\bв контексте ваша ситуация\b/gi, "в контексте вашей ситуации")
    .replace(/\bв контексте ваш ситуация\b/gi, "в контексте вашей ситуации");
}

export function formatCabinetDisplayName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
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
