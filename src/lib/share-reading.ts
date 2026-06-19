import { CHARACTERS } from "@/lib/characters";
import { TRIPLET_POSITIONS } from "@/lib/tarot";

export interface ShareReadingInput {
  title: string;
  masterName?: string;
  date?: string;
  cards?: { name: string; meaning?: string }[];
  detectedCards?: string[];
  deckType?: string;
  spreadType?: string;
  text: string;
  appUrl?: string;
}

export function masterDisplayName(id: string): string {
  if (id === "triplet") return "Расклад 3 карт";
  return CHARACTERS.find((c) => c.id === id)?.name ?? id;
}

export function buildShareReadingText(input: ShareReadingInput): string {
  const url = input.appUrl ?? (typeof window !== "undefined" ? window.location.origin : "https://aura.ai");
  const lines: string[] = ["🔮 Мой расклад Aura", ""];

  if (input.masterName) lines.push(`Мастер: ${input.masterName}`);
  if (input.date) lines.push(`Дата: ${input.date}`);
  lines.push(`Тема: ${input.title}`);

  if (input.deckType) lines.push(`Колода: ${input.deckType}`);
  if (input.spreadType) lines.push(`Расклад: ${input.spreadType}`);

  if (input.detectedCards?.length) {
    lines.push(`Карты: ${input.detectedCards.join(" · ")}`);
  } else if (input.cards?.length) {
    lines.push(
      `Карты: ${input.cards.map((c, i) => `${TRIPLET_POSITIONS[i] ?? ""} ${c.name}`.trim()).join(" · ")}`
    );
  }

  lines.push("", input.text.trim(), "", `—`, `Получить свой расклад: ${url}`);

  return lines.join("\n");
}

export async function shareReading(input: ShareReadingInput): Promise<"shared" | "copied" | "failed"> {
  const text = buildShareReadingText(input);
  const title = input.title;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return "failed";
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return "failed";
}
