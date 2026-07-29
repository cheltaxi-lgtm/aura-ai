import { InputFile } from "grammy";
import type { Context } from "grammy";
import { FULL_DECK, TRIPLET_POSITIONS } from "../deck/cards.js";
import type { DrawnCard, TarotCardDef } from "../deck/types.js";
import { chunkTelegramText } from "../site-client.js";
import { renderDayCardImage, renderTripletCollage } from "../../render/card-collage.js";

type ReplyMarkup = NonNullable<Parameters<Context["reply"]>[1]>["reply_markup"];

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const DECK_PATH_RE = /\/decks\/[^/]+\/([^/.]+)\.(?:png|webp|jpg|jpeg)/i;
const REVERSED_RE = /\(перев[^)]*\)|\(rev(?:ersed)?\.?\)|перевёрнут[аы]?|перевернут[аы]?/i;

function normalizeCardName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(REVERSED_RE, "")
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findDefByName(name: string): TarotCardDef | undefined {
  const n = normalizeCardName(name);
  if (!n) return undefined;
  return (
    FULL_DECK.find((c) => normalizeCardName(c.name) === n) ||
    FULL_DECK.find((c) => {
      const cn = normalizeCardName(c.name);
      return cn.includes(n) || n.includes(cn);
    })
  );
}

function findDefBySlug(slug: string): TarotCardDef | undefined {
  const s = slug.trim().toLowerCase();
  return FULL_DECK.find((c) => c.slug === s);
}

function parseReversed(raw: string, explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  return REVERSED_RE.test(raw);
}

/** Strip site markdown card images / headers so Telegram shows clean prose. */
export function stripReadingForTelegram(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(MD_IMAGE_RE, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pull card faces from markdown image rows in persisted readings. */
export function extractCardsFromReadingMarkdown(text: string): DrawnCard[] {
  const out: DrawnCard[] = [];
  for (const match of text.matchAll(MD_IMAGE_RE)) {
    const alt = (match[1] || "").trim();
    const url = (match[2] || "").trim();
    const slug = DECK_PATH_RE.exec(url)?.[1];
    const def = (slug && findDefBySlug(slug)) || findDefByName(alt);
    if (!def) continue;
    if (out.some((c) => c.slug === def.slug)) continue;
    const i = out.length;
    out.push({
      id: def.id,
      name: def.name,
      meaning: def.meaning,
      slug: def.slug,
      position: i,
      reversed: parseReversed(alt),
      positionLabel: TRIPLET_POSITIONS[i] ?? `Карта ${i + 1}`,
      deck_id: "tarot-veronika",
      spread_id: "triplet",
    });
    if (out.length >= 3) break;
  }
  return out;
}

export function drawnCardsFromSiteCards(
  cards: Array<{
    id?: number;
    name: string;
    reversed?: boolean;
    position?: number;
    positionLabel?: string;
    meaning?: string;
  }>
): DrawnCard[] {
  const out: DrawnCard[] = [];
  for (let i = 0; i < cards.length && out.length < 3; i++) {
    const c = cards[i]!;
    const def =
      (typeof c.id === "number" ? FULL_DECK.find((d) => d.id === c.id) : undefined) ||
      findDefByName(c.name);
    if (!def) continue;
    out.push({
      id: def.id,
      name: def.name,
      meaning: c.meaning || def.meaning,
      slug: def.slug,
      position: typeof c.position === "number" ? c.position : i,
      reversed: parseReversed(c.name, c.reversed),
      positionLabel: c.positionLabel || TRIPLET_POSITIONS[i] || `Карта ${i + 1}`,
      deck_id: "tarot-veronika",
      spread_id: "triplet",
    });
  }
  return out;
}

export function drawnCardsFromNameList(names: string[]): DrawnCard[] {
  return drawnCardsFromSiteCards(names.map((name) => ({ name })));
}

function captionFor(cards: DrawnCard[], question?: string | null): string {
  const lines = cards.map((c) => {
    const rev = c.reversed ? ", перевёрнута" : "";
    return `${c.positionLabel}: ${c.name}${rev}`;
  });
  const q = question?.trim();
  if (q) {
    const short = q.length > 80 ? `${q.slice(0, 77)}…` : q;
    return `${short}\n\n${lines.join("\n")}`.slice(0, 1024);
  }
  return lines.join("\n").slice(0, 1024);
}

async function renderCardsImage(cards: DrawnCard[], question?: string | null): Promise<Buffer> {
  if (cards.length === 1) {
    return renderDayCardImage(cards[0]!);
  }
  return renderTripletCollage(cards.slice(0, 3), {
    revealedCount: Math.min(3, cards.length),
    question: question?.trim() || undefined,
  });
}

/** Photo collage (or single card) + cleaned reading text for Telegram. */
export async function presentReadingToTelegram(
  ctx: Context,
  input: {
    reading: string;
    cards?: DrawnCard[];
    cardNames?: string[];
    question?: string | null;
    replyMarkup?: ReplyMarkup;
  }
): Promise<void> {
  let cards = input.cards?.length ? input.cards : [];
  if (!cards.length && input.cardNames?.length) {
    cards = drawnCardsFromNameList(input.cardNames);
  }
  if (!cards.length) {
    cards = extractCardsFromReadingMarkdown(input.reading);
  }

  const markup = input.replyMarkup;
  if (cards.length > 0) {
    try {
      const buf = await renderCardsImage(cards, input.question);
      await ctx.replyWithPhoto(new InputFile(buf, "spread.jpg"), {
        caption: captionFor(cards, input.question),
        reply_markup: markup,
      });
    } catch (err) {
      console.error("[present-reading] collage failed", err);
      await ctx.reply(captionFor(cards, input.question), { reply_markup: markup });
    }
  }

  const body = stripReadingForTelegram(input.reading);
  if (!body) return;
  for (const chunk of chunkTelegramText(body)) {
    await ctx.reply(chunk, { reply_markup: markup });
  }
}
