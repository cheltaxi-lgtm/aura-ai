import { CHARACTERS } from "@/lib/characters";
import { TRIPLET_POSITIONS } from "@/lib/tarot";
import { buildSharePageUrl, buildShareText } from "@/lib/share/build-url";
import type { SharePayload } from "@/lib/share/types";

export interface ShareReadingInput {
  title: string;
  masterName?: string;
  masterKey?: string;
  date?: string;
  cards?: { name: string; meaning?: string }[];
  detectedCards?: string[];
  deckType?: string;
  spreadType?: string;
  text: string;
  appUrl?: string;
  historyId?: string;
  sessionId?: string;
  /** When set, uses public share page URL instead of home */
  shareToken?: string;
}

export function masterDisplayName(id: string): string {
  if (id === "triplet") return "Расклад 3 карт";
  return CHARACTERS.find((c) => c.id === id)?.name ?? id;
}

export function shareInputToPayload(input: ShareReadingInput, kind: SharePayload["kind"] = "reading"): SharePayload {
  const cards =
    input.detectedCards?.map((name) => ({ name })) ??
    input.cards?.map((c, i) => ({
      name: c.name,
      meaning: c.meaning,
      position: TRIPLET_POSITIONS[i],
    }));

  if (input.historyId || input.sessionId) {
    return {
      kind,
      title: input.title,
      excerpt: input.text,
      masterName: input.masterName,
      masterKey: input.masterKey,
      cards,
      spreadType: input.spreadType ?? input.deckType,
      date: input.date,
      historyId: input.historyId,
      sessionId: input.sessionId,
      sourceType: input.historyId ? "history" : "session",
      sourceId: input.historyId ?? input.sessionId,
    };
  }

  return {
    kind,
    title: input.title,
    excerpt: input.text,
    masterName: input.masterName,
    masterKey: input.masterKey,
    cards,
    spreadType: input.spreadType ?? input.deckType,
    date: input.date,
    sourceType: "inline",
  };
}

export function buildShareReadingText(input: ShareReadingInput): string {
  const url =
    input.shareToken != null
      ? buildSharePageUrl(input.shareToken)
      : (input.appUrl ?? (typeof window !== "undefined" ? window.location.origin : "https://zovus.ru"));
  const lines: string[] = ["🔮 Мой расклад Zovus", ""];

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

export { buildShareText };
